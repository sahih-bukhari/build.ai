import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  clientAddress,
  isOpAllowed,
  limitsFor,
  MAX_BODY_BYTES,
  parseRequest,
  readMaxRecords,
} from "./logic.ts";

// app-api: the only door visitors of a generated site use to reach the project's database.
// Deployed with verify_jwt = false (visitors are anonymous); access is decided by the project's public key,
// the collection's allowed operations, rate limits and size caps. It talks to Postgres with the service role,
// and every value placed in a REST URL below has been validated by logic.ts (key, collection and id patterns).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function fail(code: string, message: string, status: number) {
  return reply({ ok: false, code, error: message }, status);
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""); // 48 hex characters
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function config() {
  const url = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Supabase function secrets are not configured");
  return { url, serviceKey };
}

async function rest(path: string, init: { method?: string; body?: unknown; prefer?: string } = {}): Promise<Response> {
  const { url, serviceKey } = config();
  const headers: Record<string, string> = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.prefer) headers["Prefer"] = init.prefer;
  return fetch(`${url}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`database request failed with ${response.status}`);
  return (await response.json()) as T;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", "Only POST is supported.", 405);

  try {
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_BODY_BYTES) return fail("TOO_LARGE", "The request is too large.", 413);
    const text = await req.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return fail("TOO_LARGE", "The request is too large.", 413);

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return fail("BAD_REQUEST", "The request body is not valid JSON.", 400);
    }
    const request = parseRequest(body);
    if (!request.ok) return fail("BAD_REQUEST", request.message, 400);

    // 1. Public key -> project
    const apps = await readJson<{ project_id: string }[]>(
      await rest(`project_apps?public_key=eq.${request.key}&select=project_id&limit=1`),
    );
    const projectId = apps[0]?.project_id;
    if (!projectId) return fail("INVALID_KEY", "Unknown project key.", 401);

    // 2. Rate limits: one visitor, and the whole project (so many visitors cannot flood it together)
    const limits = limitsFor(request.op);
    const client = await sha256Hex(`${projectId}:${clientAddress(req.headers)}`);
    for (const [who, limit] of [[client, limits.perClient], ["*", limits.perProject]] as const) {
      const allowed = await readJson<boolean>(
        await rest("rpc/app_hit", {
          method: "POST",
          body: { p_project: projectId, p_client: who, p_bucket: limits.bucket, p_limit: limit, p_window_seconds: limits.windowSeconds },
        }),
      );
      if (allowed !== true) return fail("RATE_LIMITED", "Too many requests; try again in a minute.", 429);
    }

    // 3. The collection must be declared and the operation must be enabled for visitors
    const collections = await readJson<{ public_ops: string[] }[]>(
      await rest(`app_collections?project_id=eq.${projectId}&name=eq.${request.collection}&select=public_ops&limit=1`),
    );
    const collection = collections[0];
    if (!collection) return fail("UNKNOWN_COLLECTION", "This collection does not exist.", 404);
    if (!isOpAllowed(collection.public_ops, request.op)) {
      return fail("FORBIDDEN", "This operation is not allowed for visitors on this collection.", 403);
    }

    // 4. Run the operation
    const scope = `project_id=eq.${projectId}&collection=eq.${request.collection}`;
    switch (request.op) {
      case "create": {
        // The visitor's browser keeps this token and needs it to edit or delete this record later; only its hash is stored.
        const token = randomToken();
        const result = await readJson<{ ok: boolean; code?: string; id?: string; created_at?: string }>(
          await rest("rpc/app_insert_record", {
            method: "POST",
            body: {
              p_project: projectId,
              p_collection: request.collection,
              p_data: request.data,
              p_max: readMaxRecords(Deno.env.get("APP_MAX_RECORDS")),
              p_owner_hash: await sha256Hex(token),
            },
          }),
        );
        if (!result.ok) return fail("LIMIT_REACHED", "This project reached its record limit.", 403);
        return reply({ ok: true, id: result.id, created_at: result.created_at, token }, 201);
      }
      case "list": {
        const rows = await readJson<{ id: string; data: unknown; created_at: string; updated_at: string }[]>(
          await rest(
            `app_records?${scope}&select=id,data,created_at,updated_at&order=created_at.desc,id.desc&limit=${request.limit + 1}&offset=${request.offset}`,
          ),
        );
        return reply({ ok: true, records: rows.slice(0, request.limit), has_more: rows.length > request.limit });
      }
      case "update": {
        const rows = await readJson<{ id: string }[]>(
          await rest(`app_records?id=eq.${request.id}&${scope}&owner_hash=eq.${await sha256Hex(request.token)}&select=id`, {
            method: "PATCH",
            body: { data: request.data },
            prefer: "return=representation",
          }),
        );
        return rows.length ? reply({ ok: true, id: request.id }) : fail("NOT_FOUND", "Record not found, or it was not created by this browser.", 404);
      }
      case "delete": {
        const rows = await readJson<{ id: string }[]>(
          await rest(`app_records?id=eq.${request.id}&${scope}&owner_hash=eq.${await sha256Hex(request.token)}&select=id`, {
            method: "DELETE",
            prefer: "return=representation",
          }),
        );
        return rows.length ? reply({ ok: true, id: request.id }) : fail("NOT_FOUND", "Record not found, or it was not created by this browser.", 404);
      }
    }
  } catch (error) {
    console.error("app-api error", error);
    return fail("SERVER_ERROR", "An internal error occurred.", 500);
  }
});
