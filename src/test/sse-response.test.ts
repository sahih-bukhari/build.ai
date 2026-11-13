import { describe, expect, it } from "vitest";
import { createSseResponse } from "../../supabase/functions/_shared/sse-response";
import { createSseParser } from "@/lib/sse";

async function readAll(response: Response): Promise<unknown[]> {
  const events: unknown[] = [];
  const parser = createSseParser((event) => events.push(event));
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.feed(decoder.decode(value, { stream: true }));
  }
  parser.end();
  return events;
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

describe("createSseResponse", () => {
  it("sends progress events and then the result", async () => {
    const response = createSseResponse(async (emit) => {
      emit({ type: "phase", phase: "reading" });
      emit({ type: "progress", files: [] });
      return json({ title: "T" });
    }, { "X-Test": "1" });
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(response.headers.get("X-Test")).toBe("1");
    expect(await readAll(response)).toEqual([
      { type: "phase", phase: "reading" },
      { type: "progress", files: [] },
      { title: "T", type: "result" },
    ]);
  });

  it("turns a failed job into an error event that keeps its code and status", async () => {
    const response = createSseResponse(async () => json({ code: "USER_DAILY_LIMIT", error: "used up" }, 429), {});
    expect(await readAll(response)).toEqual([{ code: "USER_DAILY_LIMIT", error: "used up", type: "error", status: 429 }]);
  });

  it("reports a crash of the job as an error event instead of hanging", async () => {
    const response = createSseResponse(async () => { throw new Error("boom"); }, {});
    const events = await readAll(response) as { type: string; code: string }[];
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe("error");
    expect(events[0]?.code).toBe("PROVIDER_ERROR");
  });

  it("aborts the job when the browser disconnects", async () => {
    let aborted = false;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const response = createSseResponse(async (emit, signal) => {
      signal.addEventListener("abort", () => { aborted = true; release(); });
      emit({ type: "phase", phase: "writing" });
      await gate;
      emit({ type: "progress" }); // must not throw after the disconnect
      return json({ ok: true });
    }, {});
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    await gate;
    expect(aborted).toBe(true);
  });
});
