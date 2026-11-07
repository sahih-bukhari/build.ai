import { describe, expect, it } from "vitest";
import { parseModelOutput, sanitizeHtmlFragment, toGenerationResult } from "@/lib/ai/output";

describe("AI output validation", () => {
  it("parses a valid model response and creates the expected project files", () => {
    const output = parseModelOutput(
      JSON.stringify({
        title: "نمونه",
        summary: "صفحه ساخته شد",
        html: "<main><h1>سلام</h1></main>",
        css: "body { color: #111; }",
      }),
    );
    const result = toGenerationResult(output);

    expect(result.files.map((file) => file.path)).toEqual(["index.html", "styles.css"]);
    expect(result.previewHtml).toContain("<style>body { color: #111; }</style>");
    expect(result.previewHtml).toContain("<main><h1>سلام</h1></main>");
  });

  it("rejects missing, oversized, or unexpected response properties", () => {
    expect(() => parseModelOutput("not JSON")).toThrow();
    expect(() =>
      parseModelOutput(
        JSON.stringify({ title: "x", summary: "y", html: "z", css: "", extra: "bad" }),
      ),
    ).toThrow();
    expect(() =>
      parseModelOutput(JSON.stringify({ title: "", summary: "y", html: "z", css: "" })),
    ).toThrow();
  });

  it("removes scripts and inline event handlers from generated HTML", () => {
    expect(sanitizeHtmlFragment('<img src="x" onerror="alert(1)"><script>alert(2)</script>')).toBe(
      '<img src="x" />',
    );
    expect(sanitizeHtmlFragment('<a href="javascript:alert(1)" onclick="run()">باز کن</a>')).toBe(
      '<a href="#">باز کن</a>',
    );
  });
  it("removes encoded script URLs, embedded frames, forms and redirects", () => {
    const html = sanitizeHtmlFragment('<a href="jav&#x61;script:alert(1)">x</a><iframe src="https://evil.test"></iframe><form action="https://evil.test"><input></form><meta http-equiv="refresh" content="0;url=https://evil.test"><svg onload="alert(1)"></svg>');
    expect(html).not.toMatch(/javascript:|iframe|<form|<input|<meta|<svg|onload/i);
  });
  it("restricts remote resources and blocks scripts in exported and preview documents", () => {
    const result = toGenerationResult({ title: "x", summary: "y", html: "<main>safe</main>", css: "" });
    for (const html of [result.previewHtml, ...result.files.filter((file) => file.path === "index.html").map((file) => file.content)]) {
      expect(html).toContain("script-src 'none'");
      expect(html).toContain("img-src https://images.unsplash.com");
      expect(html).toContain('name="referrer" content="no-referrer"');
    }
  });
});
