import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import type { ChatMessage, GenerateErrorCode, GenerateReply, GenerationResult, ProjectFile } from "./types";
import { referenceSchema } from "@/lib/reference-files";
import { BUDGET_TOKENS, DAILY_PERCENT, FIRST_DAY_PERCENT } from "@/lib/ai/credits";
import { COLLECTION_PATTERN, MAX_COLLECTIONS } from "../../../supabase/functions/_shared/patterns";

const generateInputSchema = z.object({
  threadId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(4_000),
  references: z.array(referenceSchema).max(3).default([]),
});

const collectionSchema = z.object({
  name: z.string().regex(COLLECTION_PATTERN),
  ops: z.array(z.enum(["create", "read", "update", "delete"])).min(1).max(4),
});

const resultSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(3_000),
  files: z.array(z.object({ path: z.string().min(1).max(180), content: z.string().max(150_000) })).min(1).max(20),
  previewHtml: z.string().min(20).max(500_000),
  model: z.string().max(100).optional(),
  // `collections` = every collection of the project after this build; `declared` = the ones to write to the database now.
  database: z.object({
    collections: z.array(collectionSchema).max(MAX_COLLECTIONS),
    declared: z.array(collectionSchema).max(MAX_COLLECTIONS),
  }).optional(),
});

function safeProjectFiles(files: ProjectFile[]): ProjectFile[] {
  const seen = new Set<string>();
  let totalBytes = 0;
  const safe: ProjectFile[] = [];
  for (const file of files) {
    const path = file.path.replaceAll("\\", "/");
    const parts = path.split("/");
    if (!path || path.startsWith("/") || parts.some((part) => !part || part === ".." || part === ".") || !/^[a-zA-Z0-9._/-]{1,180}$/.test(path) || seen.has(path)) continue;
    const bytes = new TextEncoder().encode(file.content).byteLength;
    // Limits are in bytes; Persian text takes 2-3 bytes per character, so 150k characters can be ~450 KB.
    if (bytes > 450_000 || totalBytes + bytes > 2_000_000) return [];
    totalBytes += bytes;
    seen.add(path);
    safe.push({ path, content: file.content });
  }
  return safe;
}

async function readFunctionError(error: unknown): Promise<{ code: GenerateErrorCode; status: number }> {
  let status = 0;
  let responseData: unknown;
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      status = context.status;
      responseData = await context.clone().json().catch(() => null);
    }
  }
  const remoteCode = responseData && typeof responseData === "object" && "code" in responseData
    ? String((responseData as { code: unknown }).code) : "";
  const validCodes = ["USER_DAILY_LIMIT", "RATE_LIMITED", "NO_CREDITS", "INVALID_OUTPUT"] as const;
  const code = validCodes.includes(remoteCode as typeof validCodes[number])
    ? remoteCode as typeof validCodes[number]
    : status === 429 ? "USER_DAILY_LIMIT" : status === 402 ? "NO_CREDITS" : "PROVIDER_ERROR";
  return { code, status };
}

export const generateWebsite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => generateInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<GenerateReply> => {
    const { data: project, error: projectError } = await context.supabase.from("projects")
      .select("id,name,messages,result,versions").eq("id", data.threadId).eq("user_id", context.userId).single();
    if (projectError || !project) throw new Error("پروژه پیدا نشد");

    const savedMessages = Array.isArray(project.messages) ? project.messages as unknown as ChatMessage[] : [];
    const savedResult = project.result as unknown as GenerationResult | null;
    const history = savedMessages.filter((message) => !message.error && (message.role === "user" || message.role === "assistant"))
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

    const persistGenerationError = async () => {
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "این درخواست تکمیل نشد. می‌توانید دوباره تلاش کنید.",
        error: true,
      };
      const failedMessages = [...nextMessages, errorMessage].slice(-100);
      const { error } = await context.supabase.from("projects").update({
        messages: failedMessages as unknown as Json,
        updated_at: new Date().toISOString(),
      }).eq("id", data.threadId).eq("user_id", context.userId);
      if (error) console.error("generation error history could not be saved", error.message);
    };

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

    const { data: generated, error: functionError } = await context.supabase.functions.invoke("ai-builder", {
      body: {
        prompt: data.prompt,
        history,
        currentFiles,
        references: data.references,
        ...(appKey ? { appKey, database: savedResult?.database?.collections ?? [] } : {}),
      },
    });

    if (functionError) {
      const { code } = await readFunctionError(functionError);
      console.error("ai-builder function failed", functionError.message);
      await persistGenerationError();
      return { ok: false, code };
    }

    const parsed = resultSchema.safeParse(generated);
    if (!parsed.success) {
      console.error("ai-builder returned invalid payload", parsed.error.flatten());
      await persistGenerationError();
      return { ok: false, code: "INVALID_OUTPUT" };
    }

    const files = safeProjectFiles(parsed.data.files);
    if (!files.some((file) => file.path === "index.html") || !parsed.data.previewHtml.toLowerCase().includes("<html")) {
      await persistGenerationError();
      return { ok: false, code: "INVALID_OUTPUT" };
    }

    // Write the collections the build declared (visitor permissions) before the site is saved, so it works the moment it opens.
    const database = parsed.data.database;
    if (database?.declared.length) {
      const { error: declareError } = await context.supabase.from("app_collections").upsert(
        database.declared.map((collection) => ({ project_id: data.threadId, name: collection.name, public_ops: [...new Set(collection.ops)] })),
        { onConflict: "project_id,name" },
      );
      if (declareError) {
        console.error("collections could not be saved", declareError.code, declareError.message);
        await persistGenerationError();
        return { ok: false, code: "DATABASE_ERROR" };
      }
    }

    const result: GenerationResult = {
      title: parsed.data.title,
      summary: parsed.data.summary,
      files,
      previewHtml: parsed.data.previewHtml,
      ...(parsed.data.model ? { model: parsed.data.model } : {}),
      createdAt: new Date().toISOString(),
      ...(database?.collections.length ? { database: { collections: database.collections } } : {}),
    };
    const nextMessagesWithAssistant: ChatMessage[] = [
      ...nextMessages,
      { id: crypto.randomUUID(), role: "assistant", content: result.summary, parts: [{ type: "text", text: result.summary }] },
    ];
    const previousVersions = Array.isArray(project.versions) ? project.versions as unknown as Json[] : [];
    const versionSnapshot = { id: crypto.randomUUID(), title: result.title, summary: result.summary, files: result.files, model: result.model ?? null, createdAt: result.createdAt } as unknown as Json;
    const filesMap = Object.fromEntries(files.map((file) => [file.path, file.content])) as unknown as Json;

    const { error: saveResultError } = await context.supabase.from("projects").update({
      name: result.title.slice(0, 200),
      messages: nextMessagesWithAssistant as unknown as Json,
      result: result as unknown as Json,
      files: filesMap,
      versions: [...previousVersions, versionSnapshot].slice(-10) as Json,
      updated_at: new Date().toISOString(),
    }).eq("id", data.threadId).eq("user_id", context.userId);
    if (saveResultError) {
      console.error("project result persistence failed", saveResultError.message);
      throw new Error("سایت ساخته شد، اما ذخیرهٔ نسخه در دیتابیس ناموفق بود");
    }
    return { ok: true, result };
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
