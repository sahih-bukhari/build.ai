// Planning of a project's database from what the model returned. Pure logic (unit tested in src/test/database-plan.test.ts).

import { COLLECTION_PATTERN, MAX_COLLECTIONS, PUBLIC_OPS, type PublicOp } from "./patterns.ts";

export interface DbCollection {
  name: string;
  ops: PublicOp[];
}

export interface DbPlan {
  /** Every collection of the project after this build (existing + declared). */
  collections: DbCollection[];
  /** Collections whose settings must be written to the database now (declared by the model or inferred from the code). */
  declared: DbCollection[];
  usesDb: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keeps valid collections only: valid name, known operations, no duplicates. An empty or invalid ops list becomes ["create"]. */
export function normalizeCollections(raw: unknown): DbCollection[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: DbCollection[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const name = item["name"];
    if (typeof name !== "string" || !COLLECTION_PATTERN.test(name) || seen.has(name)) continue;
    const rawOps = Array.isArray(item["ops"]) ? item["ops"] : Array.isArray(item["publicOps"]) ? item["publicOps"] : [];
    const ops = PUBLIC_OPS.filter((op) => rawOps.includes(op));
    seen.add(name);
    out.push({ name, ops: ops.length ? ops : ["create"] });
    if (out.length >= MAX_COLLECTIONS) break;
  }
  return out;
}

const USE_PATTERN = /\bdb\s*\.\s*collection\s*\(\s*(["'`])([a-z][a-z0-9_]{0,39})\1\s*\)/g;

/** Collection names the generated code actually uses, found by looking for db.collection("name"). */
export function findUsedCollections(files: { path: string; content: string }[]): string[] {
  const names = new Set<string>();
  for (const file of files) {
    if (file.path === "db.js" || !/\.(html?|m?js|jsx?|ts)$/i.test(file.path)) continue;
    for (const match of file.content.matchAll(USE_PATTERN)) {
      const name = match[2];
      if (name) names.add(name);
    }
  }
  return [...names];
}

export function planDatabase(input: {
  existing: unknown;
  declaredRaw: unknown;
  files: { path: string; content: string }[];
}): DbPlan {
  const existing = normalizeCollections(input.existing);
  const modelDeclared = normalizeCollections(input.declaredRaw);
  const known = new Set([...existing, ...modelDeclared].map((collection) => collection.name));

  // The model forgot to declare a collection its code uses: declare it with the safest settings (create-only).
  const inferred: DbCollection[] = findUsedCollections(input.files)
    .filter((name) => !known.has(name))
    .map((name) => ({ name, ops: ["create"] }));

  const byName = new Map<string, DbCollection>();
  for (const collection of existing) byName.set(collection.name, collection);
  const declared: DbCollection[] = [];
  for (const collection of [...modelDeclared, ...inferred]) {
    if (!byName.has(collection.name) && byName.size >= MAX_COLLECTIONS) continue;
    byName.set(collection.name, collection);
    declared.push(collection);
  }
  const collections = [...byName.values()];
  return { collections, declared, usesDb: collections.length > 0 };
}

const OP_LABEL: Record<PublicOp, string> = {
  create: "ثبت اطلاعات",
  read: "نمایش عمومی برای همه",
  update: "ویرایش مواردی که خودِ بازدیدکننده ثبت کرده",
  delete: "حذف مواردی که خودِ بازدیدکننده ثبت کرده",
};

/** Short Persian note appended to the assistant's summary so the owner always sees what the visitors can do. */
export function describeDeclared(declared: DbCollection[]): string {
  if (!declared.length) return "";
  const lines = declared.map((collection) => {
    const parts = collection.ops.map((op) => OP_LABEL[op]);
    const privacy = collection.ops.includes("read") ? "" : " (خصوصی؛ بازدیدکننده‌ها داده‌ها را نمی‌بینند)";
    return `• ${collection.name}: ${parts.join("، ")}${privacy}`;
  });
  return `\n\nدیتابیس واقعی برای این سایت فعال شد:\n${lines.join("\n")}`;
}
