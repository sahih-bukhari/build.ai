import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import type { DataRecord } from "@/lib/data-export";
import { COLLECTION_PATTERN, DEFAULT_MAX_RECORDS, validateData } from "../../../supabase/functions/app-api/logic";

// Owner-side access to the records of a project's database. Everything runs with the owner's session,
// so Row Level Security limits it to the owner's own projects (visitors use the app-api Edge Function instead).

const collectionSchema = z.object({ threadId: z.string().uuid(), collection: z.string().regex(COLLECTION_PATTERN) });
const listSchema = collectionSchema.extend({
  offset: z.number().int().min(0).max(10_000).default(0),
  limit: z.number().int().min(1).max(100).default(25),
});
const saveSchema = collectionSchema.extend({
  id: z.string().uuid().optional(),
  data: z.record(z.string(), z.unknown()),
});
const deleteSchema = collectionSchema.extend({ ids: z.array(z.string().uuid()).min(1).max(100) });

const EXPORT_LIMIT = DEFAULT_MAX_RECORDS;
const PAGE = 1000; // the API returns at most 1000 rows per request

interface Row {
  id: string;
  data: Json;
  created_at: string;
  updated_at: string;
  owner_hash: string | null;
}

function toRecord(row: Row): DataRecord {
  const data = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? (row.data as Record<string, unknown>) : {};
  return { id: row.id, data, createdAt: row.created_at, updatedAt: row.updated_at, byVisitor: row.owner_hash !== null };
}

export const listRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ records: DataRecord[]; total: number }> => {
    const { data: rows, count, error } = await context.supabase.from("app_records")
      .select("id,data,created_at,updated_at,owner_hash", { count: "exact" })
      .eq("project_id", data.threadId).eq("collection", data.collection)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) {
      console.error("[records] list failed", error.message);
      throw new Error("رکوردها بارگذاری نشدند");
    }
    return { records: (rows ?? []).map(toRecord), total: count ?? 0 };
  });

export const exportRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => collectionSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ records: DataRecord[] }> => {
    const records: DataRecord[] = [];
    for (let from = 0; from < EXPORT_LIMIT; from += PAGE) {
      const { data: rows, error } = await context.supabase.from("app_records")
        .select("id,data,created_at,updated_at,owner_hash")
        .eq("project_id", data.threadId).eq("collection", data.collection)
        .order("created_at", { ascending: true }).order("id", { ascending: true })
        .range(from, Math.min(from + PAGE, EXPORT_LIMIT) - 1);
      if (error) {
        console.error("[records] export failed", error.message);
        throw new Error("خروجی گرفته نشد");
      }
      records.push(...(rows ?? []).map(toRecord));
      if ((rows ?? []).length < PAGE) break;
    }
    return { records };
  });

export const saveRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const problem = validateData(data.data);
    if (problem) throw new Error("رکورد معتبر نیست: " + problem);

    if (data.id) {
      const { data: rows, error } = await context.supabase.from("app_records")
        .update({ data: data.data as Json })
        .eq("id", data.id).eq("project_id", data.threadId).eq("collection", data.collection)
        .select("id");
      if (error) {
        console.error("[records] update failed", error.message);
        throw new Error("رکورد ذخیره نشد");
      }
      if (!rows?.length) throw new Error("رکورد پیدا نشد");
      return { id: data.id };
    }

    const { count } = await context.supabase.from("app_records").select("id", { count: "exact", head: true })
      .eq("project_id", data.threadId);
    if ((count ?? 0) >= DEFAULT_MAX_RECORDS) throw new Error(`ظرفیت پروژه (${DEFAULT_MAX_RECORDS} رکورد) پر است`);

    // Records created here have no owner token, so visitors can never edit or delete them.
    const { data: inserted, error } = await context.supabase.from("app_records")
      .insert({ project_id: data.threadId, collection: data.collection, data: data.data as Json })
      .select("id").single();
    if (error || !inserted) {
      console.error("[records] insert failed", error?.message);
      throw new Error("رکورد ذخیره نشد");
    }
    return { id: inserted.id };
  });

export const deleteRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ deleted: number }> => {
    const { data: rows, error } = await context.supabase.from("app_records").delete()
      .in("id", data.ids).eq("project_id", data.threadId).eq("collection", data.collection)
      .select("id");
    if (error) {
      console.error("[records] delete failed", error.message);
      throw new Error("حذف انجام نشد");
    }
    return { deleted: rows?.length ?? 0 };
  });
