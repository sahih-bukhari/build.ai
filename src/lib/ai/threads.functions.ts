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

export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("projects")
      .select("id,name,updated_at,files,versions,messages,result")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error("پروژه‌ها بارگذاری نشدند");

    const hasContent = (row: (typeof data)[number]) => {
      const files = row.files && typeof row.files === "object" && !Array.isArray(row.files)
        ? Object.keys(row.files).length > 0
        : false;
      const versions = Array.isArray(row.versions) && row.versions.length > 0;
      const messages = Array.isArray(row.messages) && row.messages.length > 0;
      return row.result !== null || files || versions || messages;
    };
    const savedProjects = data.filter(hasContent);
    if (savedProjects.length > 0) {
      return savedProjects.map((row) => ({ id: row.id, title: row.name, updated_at: row.updated_at }));
    }

    // Keep one clean draft available for the builder. Older empty rows remain in the DB,
    // but are not shown as duplicate projects in the user's history.
    const newestDraft = data[0];
    return newestDraft ? [{ id: newestDraft.id, title: "پروژهٔ تازه", updated_at: newestDraft.updated_at }] : [];
  });

export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
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
