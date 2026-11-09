import { describe, expect, it } from "vitest";
import { streamGeneration } from "@/lib/ai/stream-client";
import { activityOf, readActivity } from "@/lib/ai/activity";

const enc = new TextEncoder();
function sse(events: unknown[], options: { split?: boolean } = {}): Response {
  const text = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  const chunks = options.split ? text.match(/[\s\S]{1,7}/g) ?? [] : [text];
  const body = new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(enc.encode(chunk)); controller.close(); } });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}
const base = { supabaseUrl: "https://x.supabase.co/", apiKey: "k", accessToken: "t", body: { prompt: "p" } };

describe("streamGeneration", () => {
  it("passes progress events through and returns the result without its type field", async () => {
    const seen: unknown[] = [];
    let request: { url: string; init: RequestInit } | null = null;
    const outcome = await streamGeneration({
      ...base,
      onEvent: (event) => seen.push(event),
      fetchImpl: (async (url: string, init: RequestInit) => {
        request = { url, init };
        return sse([{ type: "phase", phase: "reading" }, { type: "progress", files: [] }, { type: "result", title: "T", files: [{ path: "a", content: "b" }] }], { split: true });
      }) as unknown as typeof fetch,
    });
    expect(outcome).toEqual({ ok: true, result: { title: "T", files: [{ path: "a", content: "b" }] } });
    expect(seen).toEqual([{ type: "phase", phase: "reading" }, { type: "progress", files: [] }]);
    expect(request!.url).toBe("https://x.supabase.co/functions/v1/ai-builder?stream=1");
    const headers = request!.init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer t");
    expect(headers["apikey"]).toBe("k");
  });

  it("maps error events to codes", async () => {
    const run = (event: unknown) => streamGeneration({ ...base, onEvent: () => {}, fetchImpl: (async () => sse([event])) as unknown as typeof fetch });
    expect(await run({ type: "error", code: "USER_DAILY_LIMIT", status: 429 })).toEqual({ ok: false, code: "USER_DAILY_LIMIT" });
    expect(await run({ type: "error", code: "INVALID_OUTPUT", status: 502 })).toEqual({ ok: false, code: "INVALID_OUTPUT" });
    expect(await run({ type: "error", code: "WHATEVER", status: 402 })).toEqual({ ok: false, code: "NO_CREDITS" });
    expect(await run({ type: "error", status: 500 })).toEqual({ ok: false, code: "PROVIDER_ERROR" });
  });

  it("understands a plain JSON refusal from the gateway", async () => {
    const outcome = await streamGeneration({ ...base, onEvent: () => {}, fetchImpl: (async () => new Response('{"code":"UNAUTHORIZED"}', { status: 401, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch });
    expect(outcome).toEqual({ ok: false, code: "PROVIDER_ERROR" });
    const limited = await streamGeneration({ ...base, onEvent: () => {}, fetchImpl: (async () => new Response("{}", { status: 429, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch });
    expect(limited).toEqual({ ok: false, code: "USER_DAILY_LIMIT" });
  });

  it("treats a stream that ends without a result as a failure", async () => {
    const outcome = await streamGeneration({ ...base, onEvent: () => {}, fetchImpl: (async () => sse([{ type: "phase", phase: "writing" }])) as unknown as typeof fetch });
    expect(outcome).toEqual({ ok: false, code: "PROVIDER_ERROR" });
  });

  it("reports CANCELLED when the person stops it, before or during the request", async () => {
    const controller = new AbortController();
    controller.abort();
    const early = await streamGeneration({ ...base, signal: controller.signal, onEvent: () => {}, fetchImpl: (async () => { throw new DOMException("x", "AbortError"); }) as unknown as typeof fetch });
    expect(early).toEqual({ ok: false, code: "CANCELLED" });

    const second = new AbortController();
    const body = new ReadableStream({ start(c) { c.enqueue(enc.encode('data: {"type":"phase","phase":"writing"}\n\n')); setTimeout(() => c.error(new DOMException("x", "AbortError")), 20); } });
    const promise = streamGeneration({ ...base, signal: second.signal, onEvent: () => {}, fetchImpl: (async () => new Response(body, { headers: { "Content-Type": "text/event-stream" } })) as unknown as typeof fetch });
    second.abort();
    expect(await promise).toEqual({ ok: false, code: "CANCELLED" });
  });

  it("reports a network failure", async () => {
    const outcome = await streamGeneration({ ...base, onEvent: () => {}, fetchImpl: (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch });
    expect(outcome).toEqual({ ok: false, code: "PROVIDER_ERROR" });
  });
});

describe("activity", () => {
  it("summarises files, kind and collections", () => {
    const activity = activityOf({ kind: "project", files: [{ path: "main.py", content: "a\nb\nc" }, { path: "empty.txt", content: "" }], database: { collections: [{ name: "messages", ops: ["create"] }] } });
    expect(activity).toEqual({ kind: "project", files: [{ path: "main.py", lines: 3 }, { path: "empty.txt", lines: 0 }], collections: ["messages"] });
    expect(activityOf({ files: [], database: undefined }).kind).toBe("web");
  });

  it("reads a stored activity defensively", () => {
    expect(readActivity(null)).toBeUndefined();
    expect(readActivity({ files: "x" })).toBeUndefined();
    expect(readActivity({ kind: "project", files: [{ path: "a", lines: 2.4 }, { path: 5 }, null], collections: ["m", 3] })).toEqual({ kind: "project", files: [{ path: "a", lines: 2 }], collections: ["m"] });
  });
});
