import { describe, expect, it } from "vitest";
import {
  clientAddress,
  isOpAllowed,
  limitsFor,
  MAX_DATA_BYTES,
  parseRequest,
  readMaxRecords,
  requiredPermission,
  validateData,
} from "../../supabase/functions/app-api/logic";

const KEY = "pk_" + "a".repeat(48);
const ID = "123e4567-e89b-42d3-a456-426614174000";
const TOKEN = "b".repeat(48);

describe("parseRequest", () => {
  it("accepts a create request", () => {
    const parsed = parseRequest({ key: KEY, op: "create", collection: "messages", data: { name: "علی", text: "سلام" } });
    expect(parsed).toEqual({ ok: true, op: "create", key: KEY, collection: "messages", data: { name: "علی", text: "سلام" } });
  });

  it("applies list defaults and enforces bounds", () => {
    expect(parseRequest({ key: KEY, op: "list", collection: "posts" })).toEqual({ ok: true, op: "list", key: KEY, collection: "posts", limit: 50, offset: 0 });
    expect(parseRequest({ key: KEY, op: "list", collection: "posts", limit: 100, offset: 10000 }).ok).toBe(true);
    for (const bad of [0, 101, 1.5, "10", -1]) {
      expect(parseRequest({ key: KEY, op: "list", collection: "posts", limit: bad }).ok).toBe(false);
    }
    expect(parseRequest({ key: KEY, op: "list", collection: "posts", offset: 10001 }).ok).toBe(false);
  });

  it("requires a valid id for update and delete and lowercases it", () => {
    expect(parseRequest({ key: KEY, op: "delete", collection: "posts", id: "nope", token: TOKEN }).ok).toBe(false);
    expect(parseRequest({ key: KEY, op: "update", collection: "posts", id: ID, token: TOKEN, data: {} }).ok).toBe(false);
    expect(parseRequest({ key: KEY, op: "delete", collection: "posts", id: ID.toUpperCase(), token: TOKEN })).toEqual({ ok: true, op: "delete", key: KEY, collection: "posts", id: ID, token: TOKEN });
    expect(parseRequest({ key: KEY, op: "update", collection: "posts", id: ID, token: TOKEN, data: { done: true } }).ok).toBe(true);
  });

  it("requires the record token for update and delete (a visitor can only change what their browser created)", () => {
    expect(parseRequest({ key: KEY, op: "delete", collection: "posts", id: ID }).ok).toBe(false);
    expect(parseRequest({ key: KEY, op: "update", collection: "posts", id: ID, data: { a: 1 } }).ok).toBe(false);
    for (const bad of ["short", "B".repeat(48), "z".repeat(48), "b".repeat(49), 5, null]) {
      expect(parseRequest({ key: KEY, op: "delete", collection: "posts", id: ID, token: bad }).ok).toBe(false);
    }
  });

  it("rejects malformed keys, operations and collection names", () => {
    expect(parseRequest(null).ok).toBe(false);
    expect(parseRequest([]).ok).toBe(false);
    expect(parseRequest({ key: "pk_short", op: "list", collection: "a" }).ok).toBe(false);
    expect(parseRequest({ key: KEY.toUpperCase(), op: "list", collection: "a" }).ok).toBe(false);
    expect(parseRequest({ key: KEY, op: "drop", collection: "a" }).ok).toBe(false);
    for (const name of ["Posts", "1posts", "a-b", "a b", "", "a".repeat(41), "a&select=*", "a?x=1", "../x"]) {
      expect(parseRequest({ key: KEY, op: "list", collection: name }).ok).toBe(false);
    }
  });
});

describe("validateData", () => {
  it("accepts plain objects", () => {
    expect(validateData({ a: 1, b: "x", c: [1, 2], d: { e: null } })).toBeNull();
  });

  it("rejects non-objects, empty objects and arrays", () => {
    for (const bad of [null, undefined, "x", 1, [], [{ a: 1 }], {}]) expect(validateData(bad)).not.toBeNull();
  });

  it("limits the number of fields, the name length, the depth and the size", () => {
    const many = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`k${i}`, 1]));
    expect(validateData(many)).not.toBeNull();
    expect(validateData({ ["k".repeat(65)]: 1 })).not.toBeNull();
    expect(validateData({ a: { b: { c: { d: { e: { f: { g: 1 } } } } } } })).not.toBeNull(); // 7 nested objects
    expect(validateData({ a: { b: { c: { d: { e: { f: 1 } } } } } })).toBeNull(); // 6 nested objects
    expect(validateData({ text: "x".repeat(MAX_DATA_BYTES) })).not.toBeNull();
    expect(validateData({ text: "x".repeat(1000) })).toBeNull();
  });

  it("counts bytes, not characters (Persian text is multi-byte)", () => {
    expect(validateData({ text: "س".repeat(5000) })).toBeNull(); // about 10,000 bytes: fine
    expect(validateData({ text: "س".repeat(9000) })).not.toBeNull(); // 18,000 bytes
  });
});

describe("permissions and limits", () => {
  it("maps list to the read permission", () => {
    expect(requiredPermission("list")).toBe("read");
    expect(requiredPermission("create")).toBe("create");
  });

  it("allows only operations the owner enabled", () => {
    expect(isOpAllowed(["create"], "create")).toBe(true);
    expect(isOpAllowed(["create"], "list")).toBe(false);
    expect(isOpAllowed(["create", "read"], "list")).toBe(true);
    expect(isOpAllowed(["read"], "delete")).toBe(false);
    expect(isOpAllowed([], "create")).toBe(false);
    expect(isOpAllowed(null, "create")).toBe(false);
    expect(isOpAllowed("create", "create")).toBe(false);
  });

  it("uses stricter limits for writes than for reads", () => {
    expect(limitsFor("create").bucket).toBe("write");
    expect(limitsFor("update").bucket).toBe("write");
    expect(limitsFor("delete").bucket).toBe("write");
    expect(limitsFor("list").bucket).toBe("read");
    expect(limitsFor("create").perClient).toBeLessThan(limitsFor("list").perClient);
  });
});

describe("helpers", () => {
  it("reads the client address from proxy headers", () => {
    const h = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });
    expect(clientAddress(h({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientAddress(h({ "cf-connecting-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientAddress(h({}))).toBe("unknown");
  });

  it("falls back to 2000 records for a missing or invalid setting", () => {
    expect(readMaxRecords(undefined)).toBe(2000);
    expect(readMaxRecords("abc")).toBe(2000);
    expect(readMaxRecords("0")).toBe(2000);
    expect(readMaxRecords("5000")).toBe(5000);
  });
});
