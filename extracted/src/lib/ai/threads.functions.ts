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
    // Show every project owned by the signed-in user, including empty drafts.
    // Reading the base table also avoids making history visibility depend on a view.
    const { data, error } = await context.supabase.from("projects")
      .select("id,name,updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("[threads] Failed to list projects", error);
      throw new Error("پروژه‌ها بارگذاری نشدند");
    }

    return (data ?? []).flatMap((row) =>
      row.id && row.updated_at
        ? [{ id: row.id, title: row.name || EMPTY_TITLE, updated_at: row.updated_at }]
        : [],
    );
  });

export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Explicit "new project" actions must always create a distinct project.
    const { data, error } = await context.supabase.from("projects")
      .insert({ user_id: context.userId })
      .select("id")
      .single();
    if (error || !data) {
      console.error("[threads] Failed to create project", error);
      throw new Error("پروژهٔ تازه ذخیره نشد");
    }
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
