import { describe, expect, it } from "vitest";
import { columnsOf, formatCell, parseRecordJson, recordsToCsv, recordsToJson, safeFileName, type DataRecord } from "@/lib/data-export";

const record = (data: Record<string, unknown>, byVisitor = true): DataRecord => ({
  id: "id-1", data, createdAt: "2026-11-08T10:00:00Z", updatedAt: "2026-11-08T10:00:00Z", byVisitor,
});

describe("columnsOf", () => {
  it("lists field names in first-seen order without duplicates", () => {
    expect(columnsOf([record({ name: "a", phone: "1" }), record({ phone: "2", city: "x" })])).toEqual(["name", "phone", "city"]);
  });

  it("caps the number of columns", () => {
    const wide = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`f${i}`, i]));
    expect(columnsOf([record(wide)]).length).toBe(100);
    expect(columnsOf([record(wide)], 6).length).toBe(6);
  });
});

describe("formatCell", () => {
  it("shows text, numbers, booleans and objects readably", () => {
    expect(formatCell("سلام")).toBe("سلام");
    expect(formatCell(12)).toBe("12");
    expect(formatCell(false)).toBe("false");
    expect(formatCell(null)).toBe("");
    expect(formatCell({ a: 1 })).toBe('{"a":1}');
    expect(formatCell([1, 2])).toBe("[1,2]");
  });

  it("collapses whitespace and truncates long text", () => {
    expect(formatCell("a\n\n  b")).toBe("a b");
    const out = formatCell("x".repeat(200), 10);
    expect(out.length).toBe(10);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("recordsToCsv", () => {
  it("starts with a BOM, uses CRLF and writes one row per record", () => {
    const csv = recordsToCsv([record({ name: "علی", age: 30 }), record({ name: "Sara" }, false)]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("id,created_at,updated_at,source,name,age");
    expect(lines[1]).toBe("id-1,2026-11-08T10:00:00Z,2026-11-08T10:00:00Z,visitor,علی,30");
    expect(lines[2]).toBe("id-1,2026-11-08T10:00:00Z,2026-11-08T10:00:00Z,owner,Sara,");
    expect(lines[3]).toBe("");
  });

  it("quotes commas, quotes and line breaks", () => {
    const csv = recordsToCsv([record({ text: 'a, "b"\nc' })]);
    expect(csv).toContain('"a, ""b""\nc"');
  });

  it("neutralises spreadsheet formulas in text but leaves real numbers alone", () => {
    const csv = recordsToCsv([record({ a: "=HYPERLINK(\"x\")", b: "+1", c: "-2", d: "@x", e: -5, f: "ok" })]);
    const row = csv.slice(1).split("\r\n")[1] ?? "";
    expect(row).toContain("'=HYPERLINK");
    expect(row).toContain(",'+1,");
    expect(row).toContain(",'-2,");
    expect(row).toContain(",'@x,");
    expect(row).toContain(",-5,");
    expect(row.endsWith(",ok")).toBe(true);
  });

  it("writes nested values as JSON", () => {
    expect(recordsToCsv([record({ tags: ["a", "b"] })])).toContain('"[""a"",""b""]"');
  });
});

describe("recordsToJson", () => {
  it("keeps the data nested so a field named id cannot clash", () => {
    const parsed = JSON.parse(recordsToJson([record({ id: "mine", name: "x" })]));
    expect(parsed[0].id).toBe("id-1");
    expect(parsed[0].data.id).toBe("mine");
    expect(parsed[0].source).toBe("visitor");
  });
});

describe("parseRecordJson", () => {
  it("accepts a non-empty object", () => {
    expect(parseRecordJson('{"name":"علی"}')).toEqual({ ok: true, data: { name: "علی" } });
  });

  it("explains problems in Persian", () => {
    for (const bad of ["{", "[]", "5", "null", "{}", '"text"']) {
      const out = parseRecordJson(bad);
      expect(out.ok).toBe(false);
    }
    const broken = parseRecordJson("{name: 1}");
    expect(broken.ok === false && broken.error.includes("JSON")).toBe(true);
  });
});

describe("safeFileName", () => {
  it("builds a simple name with the date", () => {
    expect(safeFileName("messages", "csv", new Date("2026-11-08T12:00:00Z"))).toBe("messages-2026-11-08.csv");
    expect(safeFileName("../x y", "json", new Date("2026-11-08T12:00:00Z"))).toBe("xy-2026-11-08.json");
  });
});
