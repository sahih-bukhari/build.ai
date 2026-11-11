// Pure request logic of the app-api Edge Function. It has no Deno or network dependencies so it can be unit tested
// (see src/test/app-api-logic.test.ts) and reused by the Edge Function entry point (index.ts).

import { COLLECTION_PATTERN, KEY_PATTERN, TOKEN_PATTERN, UUID_PATTERN, type PublicOp } from "../_shared/patterns.ts";

export { COLLECTION_PATTERN, KEY_PATTERN, TOKEN_PATTERN, UUID_PATTERN };
export type { PublicOp };
export type Op = "create" | "list" | "update" | "delete";

export interface Limits {
  bucket: "read" | "write";
  perClient: number;
  perProject: number;
  windowSeconds: number;
}

export type ParsedRequest =
  | { ok: true; op: "create"; key: string; collection: string; data: Record<string, unknown> }
  | { ok: true; op: "list"; key: string; collection: string; limit: number; offset: number }
  | { ok: true; op: "update"; key: string; collection: string; id: string; token: string; data: Record<string, unknown> }
  | { ok: true; op: "delete"; key: string; collection: string; id: string; token: string }
  | { ok: false; message: string };

export const MAX_BODY_BYTES = 40_000;
export const MAX_DATA_BYTES = 16_000; // the database CHECK allows 16,384 bytes of stored jsonb
export const MAX_DATA_KEYS = 50;
export const MAX_DATA_DEPTH = 6;
export const MAX_KEY_LENGTH = 64;
export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 100;
export const MAX_LIST_OFFSET = 10_000;
export const DEFAULT_MAX_RECORDS = 2_000;

const OPS: readonly Op[] = ["create", "list", "update", "delete"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function depthOf(value: unknown, level = 0): number {
  if (level > MAX_DATA_DEPTH + 1) return level;
  if (Array.isArray(value)) return value.reduce<number>((max, item) => Math.max(max, depthOf(item, level + 1)), level + 1);
  if (isPlainObject(value)) return Object.values(value).reduce<number>((max, item) => Math.max(max, depthOf(item, level + 1)), level + 1);
  return level;
}

/** Returns an error message, or null when the record data is acceptable. */
export function validateData(data: unknown): string | null {
  if (!isPlainObject(data)) return "data must be an object";
  const keys = Object.keys(data);
  if (keys.length === 0) return "data must not be empty";
  if (keys.length > MAX_DATA_KEYS) return `data can have at most ${MAX_DATA_KEYS} fields`;
  if (keys.some((key) => key.length === 0 || key.length > MAX_KEY_LENGTH)) return "field names must be 1-64 characters";
  if (depthOf(data) > MAX_DATA_DEPTH) return `data is nested too deeply (max ${MAX_DATA_DEPTH} levels)`;
  let serialized: string;
  try {
    serialized = JSON.stringify(data);
  } catch {
    return "data must be valid JSON";
  }
  if (byteLength(serialized) > MAX_DATA_BYTES) return `data is too large (max ${MAX_DATA_BYTES} bytes)`;
  return null;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value)) return Number.NaN;
  return value < min || value > max ? Number.NaN : value;
}

export function parseRequest(body: unknown): ParsedRequest {
  if (!isPlainObject(body)) return { ok: false, message: "The request body must be a JSON object" };
  const key = body["key"];
  const op = body["op"];
  const collection = body["collection"];
  if (typeof key !== "string" || !KEY_PATTERN.test(key)) return { ok: false, message: "key is missing or malformed" };
  if (typeof op !== "string" || !OPS.includes(op as Op)) return { ok: false, message: "op must be create, list, update or delete" };
  if (typeof collection !== "string" || !COLLECTION_PATTERN.test(collection)) {
    return { ok: false, message: "collection must be 1-40 characters: lowercase letters, digits and _, starting with a letter" };
  }

  switch (op as Op) {
    case "create": {
      const data = body["data"];
      const problem = validateData(data);
      if (problem) return { ok: false, message: problem };
      return { ok: true, op: "create", key, collection, data: data as Record<string, unknown> };
    }
    case "list": {
      const limit = clampInt(body["limit"], DEFAULT_LIST_LIMIT, 1, MAX_LIST_LIMIT);
      const offset = clampInt(body["offset"], 0, 0, MAX_LIST_OFFSET);
      if (Number.isNaN(limit)) return { ok: false, message: `limit must be an integer from 1 to ${MAX_LIST_LIMIT}` };
      if (Number.isNaN(offset)) return { ok: false, message: `offset must be an integer from 0 to ${MAX_LIST_OFFSET}` };
      return { ok: true, op: "list", key, collection, limit, offset };
    }
    case "update": {
      const id = body["id"];
      if (typeof id !== "string" || !UUID_PATTERN.test(id)) return { ok: false, message: "id must be a record id" };
      const token = body["token"];
      if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return { ok: false, message: "token is missing or malformed" };
      const data = body["data"];
      const problem = validateData(data);
      if (problem) return { ok: false, message: problem };
      return { ok: true, op: "update", key, collection, id: id.toLowerCase(), token, data: data as Record<string, unknown> };
    }
    case "delete": {
      const id = body["id"];
      if (typeof id !== "string" || !UUID_PATTERN.test(id)) return { ok: false, message: "id must be a record id" };
      const token = body["token"];
      if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return { ok: false, message: "token is missing or malformed" };
      return { ok: true, op: "delete", key, collection, id: id.toLowerCase(), token };
    }
  }
}

/** The permission a visitor needs for an operation (the API says "list", the permission says "read"). */
export function requiredPermission(op: Op): PublicOp {
  return op === "list" ? "read" : op;
}

export function isOpAllowed(publicOps: unknown, op: Op): boolean {
  return Array.isArray(publicOps) && publicOps.includes(requiredPermission(op));
}

export function limitsFor(op: Op): Limits {
  return op === "list"
    ? { bucket: "read", perClient: 120, perProject: 1_500, windowSeconds: 60 }
    : { bucket: "write", perClient: 20, perProject: 300, windowSeconds: 60 };
}

/** First address of x-forwarded-for, otherwise a Cloudflare / real-ip header, otherwise "unknown". */
export function clientAddress(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = forwarded || headers.get("cf-connecting-ip")?.trim() || headers.get("x-real-ip")?.trim() || "";
  return candidate.slice(0, 64) || "unknown";
}

export function readMaxRecords(raw: string | undefined | null): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 1_000_000 ? parsed : DEFAULT_MAX_RECORDS;
}
