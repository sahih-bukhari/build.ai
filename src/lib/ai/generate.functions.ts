import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import type { ChatMessage, GenerateErrorCode, GenerateReply, GenerationResult, ProjectFile } from "./types";
import { activityOf } from "@/lib/ai/activity";
import { dropFailedAttempt } from "@/lib/ai/messages";
import { BUDGET_TOKENS, DAILY_PERCENT, FIRST_DAY_PERCENT } from "@/lib/ai/credits";
import { COLLECTION_PATTERN, MAX_COLLECTIONS } from "../../../supabase/functions/_shared/patterns";

// A build has two server steps around the live stream the browser runs against the ai-builder Edge Function:
//   beginGeneration  saves the person's message and returns what the function needs (history, current files, project key);
//   finishGeneration validates what came back, saves the collections, the files and the assistant's message.
// Credits are reserved and settled inside the Edge Function itself, so nothing here can bypass them.

const beginSchema = z.object({
  threadId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(4_000),
});

const collectionSchema = z.object({
  name: z.string().regex(COLLECTION_PATTERN),
  ops: z.array(z.enum(["create", "read", "update", "delete"])).min(1).max(4),
});

const resultSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(3_000),
  kind: z.enum(["web", "project"]).default("web"),
  files: z.array(z.object({ path: z.string().min(1).max(180), content: z.string().max(150_000) })).min(1).max(40),
  previewHtml: z.string().max(500_000).default(""),
  model: z.string().max(100).optional(),
  // `collections` = every collection of the project after this build; `declared` = the ones to write to the database now.
  database: z.object({
    collections: z.array(collectionSchema).max(MAX_COLLECTIONS),
    declared: z.array(collectionSchema).max(MAX_COLLECTIONS),
  }).optional(),
});

const finishSchema = z.object({
  threadId: z.string().uuid(),
  result: z.unknown().optional(),
  errorCode: z.enum(["USER_DAILY_LIMIT", "RATE_LIMITED", "NO_CREDITS", "PROVIDER_ERROR", "INVALID_OUTPUT", "CANCELLED"]).optional(),
});

function safeProjectFiles(files: ProjectFile[]): ProjectFile[] {
  const seen = new Set<string>();
  let totalBytes = 0;
  const safe: ProjectFile[] = [];
  for (const file of files) {
    const path = file.path.replaceAll("\\", "/");
    const parts = path.split("/");
    if (!path || path.startsWith("/") || parts.some((part) => !part || part === ".." || part === ".") || !/^[a-zA-Z0-9._/@+()\[\]=~,-]{1,180}$/.test(path) || seen.has(path)) continue;
    const bytes = new TextEncoder().encode(file.content).byteLength;
    // Limits are in bytes; Persian text takes 2-3 bytes per character, so 150k characters can be ~450 KB.
    if (bytes > 450_000 || totalBytes + bytes > 2_500_000) return [];
    totalBytes += bytes;
    seen.add(path);
    safe.push({ path, content: file.content });
  }
  return safe;
}

export interface GenerationPayload {
  prompt: string;
  history: { role: "user" | "assistant"; content: string }[];
  currentFiles: ProjectFile[];
  appKey?: string;
  database?: { name: string; ops: string[] }[];
}

export const beginGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => beginSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ payload: GenerationPayload }> => {
    const { data: project, error: projectError } = await context.supabase.from("projects")
      .select("id,name,messages,result").eq("id", data.threadId).eq("user_id", context.userId).single();
    if (projectError || !project) throw new Error("پروژه پیدا نشد");

    const storedMessages = Array.isArray(project.messages) ? project.messages as unknown as ChatMessage[] : [];
    // Sending the same request again after a failure replaces the failed attempt instead of duplicating it.
    const savedMessages = dropFailedAttempt(storedMessages, data.prompt);
    const savedResult = project.result as unknown as GenerationResult | null;
    const history = savedMessages.filter((message) => !message.error && !message.notice && (message.role === "user" || message.role === "assistant"))
      .slice(-12).map((message) => ({ role: message.role, content: message.content.slice(0, 12_000) }));
    const currentFiles = safeProjectFiles(savedResult?.files ?? []);
    const nextMessages: ChatMessage[] = [
      ...savedMessages.slice(-98),
      { id: crypto.randomUUID(), role: "user", content: data.prompt, parts: [{ type: "text", text: data.prompt }] },
    ];

    const { error: saveUserError } = await context.supabase.from("projects").update({
      messages: nextMessages as unknown as Json,
      name: savedMessages.length ? project.name : data.prompt.slice(0, 70),
      updated_at: new Date().toISOString(),
    }).eq("id", data.threadId).eq("user_id", context.userId);
    if (saveUserError) throw new Error("پیام ذخیره نشد؛ دوباره امتحان کنید");

    // The project's public database key. If it cannot be loaded (for example the database migrations are not applied yet)
    // the build still works, just without the database feature.
    let appKey: string | null = null;
    const { error: ensureKeyError } = await context.supabase.from("project_apps")
      .upsert({ project_id: data.threadId }, { onConflict: "project_id", ignoreDuplicates: true });
    if (ensureKeyError) {
      console.error("project key could not be created", ensureKeyError.message);
    } else {
      const { data: keyRow, error: keyError } = await context.supabase.from("project_apps")
        .select("public_key").eq("project_id", data.threadId).maybeSingle();
      if (keyError) console.error("project key could not be read", keyError.message);
      appKey = keyRow?.public_key ?? null;
    }

    return {
      payload: {
        prompt: data.prompt,
        history,
        currentFiles,
        ...(appKey ? { appKey, database: savedResult?.database?.collections ?? [] } : {}),
      },
    };
  });

export const finishGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => finishSchema.parse(input))
  .handler(async ({ data, context }): Promise<GenerateReply> => {
    const { data: project, error: projectError } = await context.supabase.from("projects")
      .select("id,messages,versions").eq("id", data.threadId).eq("user_id", context.userId).single();
    if (projectError || !project) throw new Error("پروژه پیدا نشد");
    const savedMessages = Array.isArray(project.messages) ? project.messages as unknown as ChatMessage[] : [];

    const saveMessage = async (message: ChatMessage, extra: Record<string, Json> = {}): Promise<boolean> => {
      const { error } = await context.supabase.from("projects").update({
        messages: [...savedMessages, message].slice(-100) as unknown as Json,
        updated_at: new Date().toISOString(),
        ...extra,
      }).eq("id", data.threadId).eq("user_id", context.userId);
      if (error) console.error("assistant message could not be saved", error.message);
      return !error;
    };
    const fail = async (code: GenerateErrorCode): Promise<GenerateReply> => {
      await saveMessage(code === "CANCELLED"
        ? { id: crypto.randomUUID(), role: "assistant", content: "ساخت متوقف شد.", notice: true }
        : { id: crypto.randomUUID(), role: "assistant", content: "این درخواست تکمیل نشد. می‌توانید دوباره تلاش کنید.", error: true });
      return { ok: false, code };
    };

    if (data.errorCode) return fail(data.errorCode);

    const parsed = resultSchema.safeParse(data.result);
    if (!parsed.success) {
      console.error("ai-builder returned invalid payload", parsed.error.flatten());
      return fail("INVALID_OUTPUT");
    }
    const files = safeProjectFiles(parsed.data.files);
    const isWeb = parsed.data.kind === "web";
    if (!files.length || (isWeb && (!files.some((file) => file.path === "index.html") || !parsed.data.previewHtml.toLowerCase().includes("<html")))) {
      return fail("INVALID_OUTPUT");
    }

    // Write the collections the build declared (visitor permissions) before the site is saved, so it works the moment it opens.
    const database = isWeb ? parsed.data.database : undefined;
    if (database?.declared.length) {
      const { error: declareError } = await context.supabase.from("app_collections").upsert(
        database.declared.map((collection) => ({ project_id: data.threadId, name: collection.name, public_ops: [...new Set(collection.ops)] })),
        { onConflict: "project_id,name" },
      );
      if (declareError) {
        console.error("collections could not be saved", declareError.code, declareError.message);
        return fail("DATABASE_ERROR");
      }
    }

    const result: GenerationResult = {
      title: parsed.data.title,
      summary: parsed.data.summary,
      kind: parsed.data.kind,
      files,
      previewHtml: isWeb ? parsed.data.previewHtml : "",
      ...(parsed.data.model ? { model: parsed.data.model } : {}),
      createdAt: new Date().toISOString(),
      ...(database?.collections.length ? { database: { collections: database.collections } } : {}),
    };
    const assistant: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: result.summary,
      activity: activityOf(result),
      parts: [{ type: "text", text: result.summary }],
    };
    const previousVersions = Array.isArray(project.versions) ? project.versions as unknown as Json[] : [];
    const versionSnapshot = { id: crypto.randomUUID(), title: result.title, summary: result.summary, files: result.files, model: result.model ?? null, createdAt: result.createdAt } as unknown as Json;
    const filesMap = Object.fromEntries(files.map((file) => [file.path, file.content])) as unknown as Json;

    const saved = await saveMessage(assistant, {
      name: result.title.slice(0, 200),
      result: result as unknown as Json,
      files: filesMap,
      versions: [...previousVersions, versionSnapshot].slice(-10) as Json,
    });
    if (!saved) throw new Error("پروژه ساخته شد، اما ذخیرهٔ نسخه در دیتابیس ناموفق بود");
    return { ok: true, result, message: assistant };
  });

export const getMyUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const todayUtc = new Date().toISOString().slice(0, 10);
    const [today, earlier] = await Promise.all([
      context.supabase.from("ai_usage_daily").select("count")
        .eq("user_id", context.userId).eq("usage_day", todayUtc).eq("kind", "generate").maybeSingle(),
      context.supabase.from("ai_usage_daily").select("usage_day")
        .eq("user_id", context.userId).lt("usage_day", todayUtc).limit(1),
    ]);
    if (today.error || earlier.error) throw new Error("مصرف روزانه بارگذاری نشد");
    // All numbers are percentages of the token budget. `count` stores tokens used today.
    // The first day of use gets FIRST_DAY_PERCENT, every later day DAILY_PERCENT (same rule as the database).
    const limit = (earlier.data?.length ?? 0) > 0 ? DAILY_PERCENT : FIRST_DAY_PERCENT;
    const usedRaw = ((today.data?.count ?? 0) / BUDGET_TOKENS) * 100;
    const used = Math.min(Math.round(usedRaw * 10) / 10, limit);
    const remaining = Math.max(Math.round((limit - usedRaw) * 10) / 10, 0);
    return { limit, remaining, used };
  });
