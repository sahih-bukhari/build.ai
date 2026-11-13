import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { COLLECTION_PATTERN } from "../../../supabase/functions/app-api/logic";

// Owner-side access to a project's database settings: its public key and its collections.
// Visitors of a generated site never use these functions; they call the app-api Edge Function.

const projectSchema = z.object({ threadId: z.string().uuid() });
const opsSchema = z.array(z.enum(["create", "read", "update", "delete"])).max(4);
const declareSchema = projectSchema.extend({
  name: z.string().regex(COLLECTION_PATTERN),
  // Safe default: visitors may only add records (a write-only inbox, e.g. a contact form).
  publicOps: opsSchema.default(["create"]),
});
const removeSchema = projectSchema.extend({ name: z.string().regex(COLLECTION_PATTERN) });

export interface AppCollection {
  name: string;
  publicOps: string[];
  /** Number of records stored in the collection (only filled by getProjectApp). */
  count: number;
}

export interface ProjectApp {
  publicKey: string;
  apiUrl: string;
  collections: AppCollection[];
}

function apiUrl(): string {
  const base = process.env["SUPABASE_URL"]?.replace(/\/+$/, "");
  if (!base) throw new Error("SUPABASE_URL is not configured");
  return `${base}/functions/v1/app-api`;
}

export const getProjectApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => projectSchema.parse(input))
  .handler(async ({ data, context }): Promise<ProjectApp> => {
    const { data: owned } = await context.supabase.from("projects").select("id")
      .eq("id", data.threadId).eq("user_id", context.userId).maybeSingle();
    if (!owned) throw new Error("پروژه پیدا نشد");

    // Creates the key on first use; an existing key is left untouched.
    const { error: ensureError } = await context.supabase.from("project_apps")
      .upsert({ project_id: data.threadId }, { onConflict: "project_id", ignoreDuplicates: true });
    if (ensureError) {
      console.error("[app-data] ensure project app failed", ensureError.message);
      throw new Error("کلید دیتابیس ساخته نشد");
    }

    const [key, collections] = await Promise.all([
      context.supabase.from("project_apps").select("public_key").eq("project_id", data.threadId).single(),
      context.supabase.from("app_collections").select("name,public_ops").eq("project_id", data.threadId).order("name"),
    ]);
    if (key.error || !key.data || collections.error) {
      console.error("[app-data] load failed", key.error?.message ?? collections.error?.message);
      throw new Error("تنظیمات دیتابیس بارگذاری نشد");
    }
    const rows = collections.data ?? [];
    const counts = await Promise.all(rows.map(async (row) => {
      const { count, error } = await context.supabase.from("app_records").select("id", { count: "exact", head: true })
        .eq("project_id", data.threadId).eq("collection", row.name);
      if (error) console.error("[app-data] count failed", error.message);
      return count ?? 0;
    }));
    return {
      publicKey: key.data.public_key,
      apiUrl: apiUrl(),
      collections: rows.map((row, index) => ({ name: row.name, publicOps: row.public_ops, count: counts[index] ?? 0 })),
    };
  });

export const declareCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => declareSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ name: string; publicOps: string[] }> => {
    const publicOps = [...new Set(data.publicOps)];
    const { error } = await context.supabase.from("app_collections")
      .upsert({ project_id: data.threadId, name: data.name, public_ops: publicOps }, { onConflict: "project_id,name" });
    if (error) {
      console.error("[app-data] declare collection failed", error.code, error.message);
      throw new Error(error.code === "54000" ? "حداکثر ۲۰ مجموعه برای هر پروژه مجاز است" : "مجموعه ذخیره نشد");
    }
    return { name: data.name, publicOps };
  });

export const removeCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => removeSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Deleting a collection also deletes its records (ON DELETE CASCADE).
    const { error } = await context.supabase.from("app_collections").delete()
      .eq("project_id", data.threadId).eq("name", data.name);
    if (error) throw new Error("مجموعه حذف نشد");
    return { ok: true as const };
  });

export const rotateAppKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => projectSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ publicKey: string }> => {
    const { data: before } = await context.supabase.from("project_apps").select("public_key")
      .eq("project_id", data.threadId).maybeSingle();

    const { data: key, error } = await context.supabase.rpc("rotate_app_key", { p_project_id: data.threadId });
    if (error || typeof key !== "string") {
      console.error("[app-data] rotate key failed", error?.message);
      throw new Error("کلید تازه ساخته نشد");
    }

    // Keep the project working in the builder: the saved db.js and the saved preview still contain the old key, so swap it.
    // (Sites already downloaded or published keep the old key and stop working until they are exported again.)
    const oldKey = before?.public_key;
    if (oldKey && oldKey !== key) {
      const { data: project } = await context.supabase.from("projects").select("files,result")
        .eq("id", data.threadId).eq("user_id", context.userId).maybeSingle();
      if (project) {
        const swap = (value: Json | null): Json | null =>
          value === null ? null : (JSON.parse(JSON.stringify(value).split(oldKey).join(key)) as Json);
        const { error: updateError } = await context.supabase.from("projects")
          .update({ files: swap(project.files) ?? {}, result: swap(project.result), updated_at: new Date().toISOString() })
          .eq("id", data.threadId).eq("user_id", context.userId);
        if (updateError) console.error("[app-data] could not refresh saved files after key rotation", updateError.message);
      }
    }
    return { publicKey: key };
  });
