import { describe, expect, it } from "vitest";
import { createSseParser } from "@/lib/sse";

const collect = () => {
  const events: unknown[] = [];
  return { events, parser: createSseParser((event) => events.push(event)) };
};

describe("createSseParser", () => {
  it("parses events that arrive whole", () => {
    const { events, parser } = collect();
    parser.feed('data: {"a":1}\n\ndata: {"b":2}\n\n');
    expect(events).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("joins an event that is split across chunks, even in the middle of a line", () => {
    const { events, parser } = collect();
    for (const chunk of ['da', 'ta: {"text":"سل', 'ام"}\n', "\n", 'data: {"n":2}', "\n\n"]) parser.feed(chunk);
    expect(events).toEqual([{ text: "سلام" }, { n: 2 }]);
  });

  it("handles CRLF line ends, comments and a missing space after data:", () => {
    const { events, parser } = collect();
    parser.feed(': keep-alive\r\n\r\ndata:{"a":1}\r\n\r\n');
    expect(events).toEqual([{ a: 1 }]);
  });

  it("joins multi-line data and skips invalid JSON", () => {
    const { events, parser } = collect();
    parser.feed('data: {"a":\ndata: 1}\n\ndata: not json\n\ndata: {"ok":true}\n\n');
    expect(events).toEqual([{ a: 1 }, { ok: true }]);
  });

  it("flushes a final event that has no blank line after it", () => {
    const { events, parser } = collect();
    parser.feed('data: {"last":true}');
    expect(events).toEqual([]);
    parser.end();
    expect(events).toEqual([{ last: true }]);
  });
});
