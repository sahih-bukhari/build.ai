import { describe, expect, it } from "vitest";
import { apiUrlFromSdk, buildSdk } from "../../supabase/functions/_shared/sdk";

const apiUrl = "https://abcdefgh.supabase.co/functions/v1/app-api";
const key = "pk_" + "d".repeat(48);

interface Call { url: string; body: Record<string, unknown> }

function setup(responder: (body: Record<string, unknown>) => { status?: number; json: unknown } | "network-error", withStorage = true) {
  const calls: Call[] = [];
  const store = new Map<string, string>();
  const fakeFetch = (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    calls.push({ url, body });
    const answer = responder(body);
    if (answer === "network-error") return Promise.reject(new TypeError("failed"));
    const status = answer.status ?? 200;
    return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(answer.json) });
  };
  const win: Record<string, unknown> = {};
  if (withStorage) {
    win["localStorage"] = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    };
  } else {
    Object.defineProperty(win, "localStorage", { get() { throw new Error("SecurityError"); } });
  }
  new Function("window", "fetch", buildSdk({ apiUrl, key }))(win, fakeFetch);
  return { db: win["db"] as { collection(name: string): any; messageFor(error: unknown): string }, calls, store };
}

async function failure(promise: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    return error as { code: string; message: string };
  }
  throw new Error("expected a rejection");
}

describe("buildSdk", () => {
  it("embeds the key and URL, is pure ASCII, and refuses unsafe input", () => {
    const code = buildSdk({ apiUrl, key });
    expect(code).toContain(apiUrl);
    expect(code).toContain(key);
    expect(/^[\x00-\x7f]*$/.test(code)).toBe(true);
    expect(apiUrlFromSdk(code)).toBe(apiUrl);
    expect(() => buildSdk({ apiUrl: "https://evil.example/x", key })).toThrow();
    expect(() => buildSdk({ apiUrl, key: "pk_short" })).toThrow();
  });
});

describe("db.js in a browser", () => {
  it("creates a record, keeps its token, and then lists it as mine", async () => {
    const { db, calls, store } = setup((body) => {
      if (body["op"] === "create") return { status: 201, json: { ok: true, id: "id-1", created_at: "t1", token: "tok-1" } };
      return { json: { ok: true, has_more: false, records: [{ id: "id-1", data: { a: 1 }, created_at: "t1", updated_at: "t1" }, { id: "id-2", data: { a: 2 }, created_at: "t0", updated_at: "t0" }] } };
    });
    const messages = db.collection("messages");
    const created = await messages.create({ a: 1 });
    expect(created).toEqual({ id: "id-1", createdAt: "t1" });
    expect(calls[0]?.url).toBe(apiUrl);
    expect(calls[0]?.body["key"]).toBe(key);
    expect(store.size).toBe(1);
    const listed = await messages.list({ limit: 10 });
    expect(listed.records.map((r: { id: string; mine: boolean }) => [r.id, r.mine])).toEqual([["id-1", true], ["id-2", false]]);
    expect(listed.hasMore).toBe(false);
    expect(listed.records[0].data).toEqual({ a: 1 });
  });

  it("updates and removes only records created in this browser, sending the token", async () => {
    const { db, calls } = setup((body) => {
      if (body["op"] === "create") return { status: 201, json: { ok: true, id: "id-1", created_at: "t", token: "tok-1" } };
      return { json: { ok: true, id: body["id"] } };
    });
    const todos = db.collection("todos");
    await todos.create({ done: false });
    await todos.update("id-1", { done: true });
    expect(calls[1]?.body["token"]).toBe("tok-1");
    expect((await failure(todos.update("other", { done: true }))).code).toBe("NOT_OWNER");
    await todos.remove("id-1");
    expect(calls[2]?.body["op"]).toBe("delete");
    expect((await failure(todos.remove("id-1"))).code).toBe("NOT_OWNER"); // the token is forgotten after deleting
  });

  it("still works when localStorage is blocked (in-memory fallback)", async () => {
    const { db } = setup((body) => (body["op"] === "create"
      ? { status: 201, json: { ok: true, id: "id-1", created_at: "t", token: "tok-1" } }
      : { json: { ok: true, id: body["id"] } }), false);
    const c = db.collection("todos");
    await c.create({ x: 1 });
    expect((await c.update("id-1", { x: 2 })).id).toBe("id-1");
  });

  it("turns server and network errors into errors with a code and a Persian message", async () => {
    const limited = setup(() => ({ status: 429, json: { ok: false, code: "RATE_LIMITED", error: "slow down" } }));
    const err = await failure(limited.db.collection("a").create({ x: 1 }));
    expect(err.code).toBe("RATE_LIMITED");
    expect(limited.db.messageFor(err)).toContain("درخواست");
    const offline = setup(() => "network-error");
    const netErr = await failure(offline.db.collection("a").list());
    expect(netErr.code).toBe("NETWORK");
    expect(offline.db.messageFor(netErr)).toContain("اینترنت");
    expect(offline.db.messageFor(new Error("weird"))).toContain("خطایی");
  });

  it("rejects invalid collection names immediately", () => {
    const { db } = setup(() => ({ json: { ok: true } }));
    for (const bad of ["Bad", "1a", "a-b", "", "x".repeat(41)]) expect(() => db.collection(bad)).toThrow();
  });
});
