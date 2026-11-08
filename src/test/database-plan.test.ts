import { describe, expect, it } from "vitest";
import { describeDeclared, findUsedCollections, normalizeCollections, planDatabase } from "../../supabase/functions/_shared/database";

describe("normalizeCollections", () => {
  it("keeps valid collections, drops invalid names and duplicates", () => {
    const out = normalizeCollections([
      { name: "messages", ops: ["create"] },
      { name: "Bad-Name", ops: ["create"] },
      { name: "messages", ops: ["read"] },
      { name: "posts", ops: ["create", "read", "hack", "read"] },
      "nope",
      null,
    ]);
    expect(out).toEqual([{ name: "messages", ops: ["create"] }, { name: "posts", ops: ["create", "read"] }]);
  });

  it("falls back to create-only when ops are missing or invalid", () => {
    expect(normalizeCollections([{ name: "a" }, { name: "b", ops: [] }, { name: "c", ops: ["drop"] }])).toEqual([
      { name: "a", ops: ["create"] }, { name: "b", ops: ["create"] }, { name: "c", ops: ["create"] },
    ]);
  });

  it("returns an empty list for non-arrays and caps at 20", () => {
    expect(normalizeCollections(undefined)).toEqual([]);
    expect(normalizeCollections({})).toEqual([]);
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `c${i}`, ops: ["create"] }));
    expect(normalizeCollections(many).length).toBe(20);
  });
});

describe("findUsedCollections", () => {
  it("finds db.collection(...) calls in html and js but ignores db.js itself", () => {
    const files = [
      { path: "index.html", content: '<script>const m = db.collection("messages"); db . collection( \'orders\' )</script>' },
      { path: "app.js", content: "const p = db.collection(`posts`);" },
      { path: "style.css", content: 'db.collection("css")' },
      { path: "db.js", content: 'db.collection("internal")' },
    ];
    expect(findUsedCollections(files).sort()).toEqual(["messages", "orders", "posts"]);
  });

  it("ignores dynamic or invalid names", () => {
    expect(findUsedCollections([{ path: "a.js", content: 'db.collection(name); db.collection("Bad"); db.collection("x"+y)' }])).toEqual([]);
  });
});

describe("planDatabase", () => {
  const form = [{ path: "index.html", content: '<script>db.collection("messages").create({})</script>' }];

  it("uses no database when nothing is declared or used", () => {
    const plan = planDatabase({ existing: [], declaredRaw: undefined, files: [{ path: "index.html", content: "<p>hi</p>" }] });
    expect(plan.usesDb).toBe(false);
    expect(plan.declared).toEqual([]);
  });

  it("declares what the model asked for", () => {
    const plan = planDatabase({ existing: [], declaredRaw: [{ name: "messages", ops: ["create"] }], files: form });
    expect(plan.usesDb).toBe(true);
    expect(plan.declared).toEqual([{ name: "messages", ops: ["create"] }]);
    expect(plan.collections).toEqual([{ name: "messages", ops: ["create"] }]);
  });

  it("declares a forgotten collection with the safest settings (create-only)", () => {
    const plan = planDatabase({ existing: [], declaredRaw: [], files: form });
    expect(plan.declared).toEqual([{ name: "messages", ops: ["create"] }]);
  });

  it("keeps existing collections untouched on a follow-up and does not re-declare them", () => {
    const existing = [{ name: "messages", ops: ["create", "read"] }];
    const plan = planDatabase({ existing, declaredRaw: undefined, files: form });
    expect(plan.declared).toEqual([]);
    expect(plan.collections).toEqual([{ name: "messages", ops: ["create", "read"] }]);
    expect(plan.usesDb).toBe(true);
  });

  it("lets an explicit declaration change an existing collection and add new ones", () => {
    const plan = planDatabase({
      existing: [{ name: "messages", ops: ["create"] }],
      declaredRaw: [{ name: "messages", ops: ["create", "read"] }, { name: "polls", ops: ["create", "read"] }],
      files: form,
    });
    expect(plan.collections).toEqual([{ name: "messages", ops: ["create", "read"] }, { name: "polls", ops: ["create", "read"] }]);
    expect(plan.declared.length).toBe(2);
  });

  it("never exceeds 20 collections", () => {
    const existing = Array.from({ length: 20 }, (_, i) => ({ name: `c${i}`, ops: ["create"] }));
    const plan = planDatabase({ existing, declaredRaw: [{ name: "extra", ops: ["create"] }], files: form });
    expect(plan.collections.length).toBe(20);
    expect(plan.declared.length).toBe(0);
  });
});

describe("describeDeclared", () => {
  it("is empty when nothing is declared", () => {
    expect(describeDeclared([])).toBe("");
  });

  it("tells the owner what visitors can do and whether the data is private", () => {
    const text = describeDeclared([{ name: "messages", ops: ["create"] }, { name: "posts", ops: ["create", "read", "delete"] }]);
    expect(text).toContain("messages");
    expect(text).toContain("خصوصی");
    expect(text).toContain("posts");
    expect(text.split("خصوصی").length - 1).toBe(1);
  });
});
