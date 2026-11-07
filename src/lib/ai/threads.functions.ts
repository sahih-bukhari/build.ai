import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import type { ChatMessage, GenerationResult } from "./types";

export const threadIdSchema = z.object({ threadId: z.string().uuid() });

function toChatMessages(value: Json): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ChatMessage[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, Json | undefined>;
    if (typeof row.id !== "string" || (row.role !== "user" && row.role !== "assistant") || typeof row.content !== "string") return [];
    return [{ id: row.id, role: row.role, content: row.content.slice(0, 100_000), ...(row.error === true ? { error: true } : {}) }];
  });
}

function toGenerationResult(value: Json | null): GenerationResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, Json | undefined>;
  if (typeof row.title !== "string" || typeof row.summary !== "string" || typeof row.previewHtml !== "string" || !Array.isArray(row.files)) return null;
  const files = row.files.flatMap((item): { path: string; content: string }[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const file = item as Record<string, Json | undefined>;
    if (typeof file.path !== "string" || typeof file.content !== "string") return [];
    return [{ path: file.path, content: file.content }];
  });
  return {
    title: row.title,
    summary: row.summary,
    files,
    previewHtml: row.previewHtml,
    ...(typeof row.model === "string" ? { model: row.model } : {}),
    ...(typeof row.createdAt === "string" ? { createdAt: row.createdAt } : {}),
  };
}

const EMPTY_TITLE = "پروژهٔ تازه";

export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Only metadata is loaded; project_summaries (see migration 20261106020000) tells us
    // whether a project has content without downloading files/versions/messages.
    const { data, error } = await context.supabase.from("project_summaries")
      .select("id,name,updated_at,has_content")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error("پروژه‌ها بارگذاری نشدند");

    const rows = data.flatMap((row) =>
      row.id && row.updated_at ? [{ id: row.id, title: row.name || EMPTY_TITLE, updated_at: row.updated_at, hasContent: row.has_content === true }] : [],
    );
    const saved = rows.filter((row) => row.hasContent);
    if (saved.length > 0) return saved.map(({ id, title, updated_at }) => ({ id, title, updated_at }));

    // Keep one clean draft available for the builder; other empty rows stay hidden.
    const newestDraft = rows[0];
    return newestDraft ? [{ id: newestDraft.id, title: EMPTY_TITLE, updated_at: newestDraft.updated_at }] : [];
  });

export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Reuse the newest empty draft instead of inserting a new empty row on every visit.
    const { data: draft } = await context.supabase.from("project_summaries")
      .select("id").eq("user_id", context.userId).eq("has_content", false)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (draft?.id) return { id: draft.id };

    const { data, error } = await context.supabase.from("projects")
      .insert({ user_id: context.userId }).select("id").single();
    if (error || !data) throw new Error("پروژهٔ تازه ذخیره نشد");
    return data;
  });

export const getThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => threadIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("projects")
      .select("id,name,messages,result").eq("id", data.threadId).eq("user_id", context.userId).single();
    if (error || !row) throw new Error("این پروژه پیدا نشد یا به حساب شما تعلق ندارد");
    return { id: row.id, title: row.name, messages: toChatMessages(row.messages), result: toGenerationResult(row.result) };
  });

export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => threadIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("projects").delete()
      .eq("id", data.threadId).eq("user_id", context.userId);
    if (error) throw new Error("پروژه حذف نشد");
    return { ok: true };
  });
