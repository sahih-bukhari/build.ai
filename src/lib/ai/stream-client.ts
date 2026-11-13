import { createSseParser } from "@/lib/sse";

// Calls the ai-builder Edge Function in streaming mode straight from the browser, so the person watches the build
// happen. The function authorises with the person's own session token. Unit tested in src/test/stream-client.test.ts.

export type StreamErrorCode = "USER_DAILY_LIMIT" | "RATE_LIMITED" | "NO_CREDITS" | "INVALID_OUTPUT" | "CANCELLED" | "PROVIDER_ERROR";
export type StreamOutcome = { ok: true; result: unknown } | { ok: false; code: StreamErrorCode; /** Short technical reason, shown under the error to help find the cause. */ detail?: string };

const KNOWN: StreamErrorCode[] = ["USER_DAILY_LIMIT", "RATE_LIMITED", "NO_CREDITS", "INVALID_OUTPUT", "CANCELLED"];

function codeFrom(code: unknown, status: unknown): StreamErrorCode {
  if (typeof code === "string" && KNOWN.includes(code as StreamErrorCode)) return code as StreamErrorCode;
  return status === 429 ? "USER_DAILY_LIMIT" : status === 402 ? "NO_CREDITS" : "PROVIDER_ERROR";
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) || (error instanceof DOMException && error.name === "AbortError") || (error instanceof Error && error.name === "AbortError");
}

export async function streamGeneration(input: {
  supabaseUrl: string;
  apiKey: string;
  accessToken: string;
  body: unknown;
  signal?: AbortSignal;
  onEvent: (event: unknown) => void;
  fetchImpl?: typeof fetch;
}): Promise<StreamOutcome> {
  const doFetch = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await doFetch(`${input.supabaseUrl.replace(/\/+$/, "")}/functions/v1/ai-builder?stream=1`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", Authorization: `Bearer ${input.accessToken}`, apikey: input.apiKey },
      body: JSON.stringify(input.body),
      ...(input.signal ? { signal: input.signal } : {}),
    });
  } catch (error) {
    return isAbort(error, input.signal) ? { ok: false, code: "CANCELLED" } : { ok: false, code: "PROVIDER_ERROR", detail: "network: request did not reach the function (offline, blocked, or CORS)" };
  }

  const isStream = (response.headers.get("content-type") ?? "").includes("text/event-stream");
  if (!response.ok || !response.body || !isStream) {
    // The gateway can refuse before the function runs (expired session, platform error): that answer is plain JSON.
    const data = (await response.json().catch(() => null)) as { code?: unknown; files?: unknown } | null;
    // An older ai-builder function (deployed before live streaming existed) answers with one JSON document. Accept a
    // successful one, so a newer app keeps working with it (it just shows no live progress).
    if (response.ok && data && Array.isArray(data.files)) return { ok: true, result: data };
    return { ok: false, code: codeFrom(data?.code, response.status), detail: `http ${response.status}${isStream ? "" : ", not a stream"}${typeof data?.code === "string" ? `, ${data.code}` : ""}` };
  }

  let outcome: StreamOutcome | null = null;
  const parser = createSseParser((event) => {
    if (!event || typeof event !== "object") return;
    const data = event as Record<string, unknown>;
    if (data["type"] === "result") {
      const { type: _type, ...result } = data;
      outcome = { ok: true, result };
    } else if (data["type"] === "error") {
      outcome = { ok: false, code: codeFrom(data["code"], data["status"]) };
    } else {
      input.onEvent(event);
    }
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.feed(decoder.decode(value, { stream: true }));
    }
  } catch (error) {
    return isAbort(error, input.signal) ? { ok: false, code: "CANCELLED" } : { ok: false, code: "PROVIDER_ERROR", detail: "stream interrupted" };
  }
  parser.end();
  // A stream that ended without a result (connection dropped, function cut off) is a failure, never a silent success.
  return outcome ?? (input.signal?.aborted ? { ok: false, code: "CANCELLED" } : { ok: false, code: "PROVIDER_ERROR", detail: "stream ended without a result" });
}
