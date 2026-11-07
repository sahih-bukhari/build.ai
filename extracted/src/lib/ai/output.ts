import { z } from "zod";
import sanitizeHtml from "sanitize-html";
import type { GenerationResult } from "./types";

const modelOutputSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    summary: z.string().trim().min(1).max(500),
    html: z.string().min(1).max(40_000),
    css: z.string().max(30_000),
  })
  .strict();

export type ModelOutput = z.infer<typeof modelOutputSchema>;

export function parseModelOutput(raw: string): ModelOutput {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed: unknown = JSON.parse(text);
  return modelOutputSchema.parse(parsed);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char] ?? char;
  });
}

export function sanitizeHtmlFragment(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img"],
    allowedAttributes: { "*": ["class", "id", "dir", "lang", "title", "aria-label", "role"], a: ["href"], img: ["src", "alt", "width", "height", "loading"] },
    allowedSchemes: ["https", "mailto", "tel"],
    allowProtocolRelative: false,
    transformTags: { a: (_tag, attributes) => ({ tagName: "a", attribs: { ...attributes, href: attributes['href']?.replace(/[\u0000-\u0020]/g, "").toLowerCase().startsWith("javascript:") ? "#" : attributes['href'] ?? "#" } }) },
  });
}

export function toGenerationResult(output: ModelOutput): GenerationResult {
  const title = output.title.trim();
  const safeHtml = sanitizeHtmlFragment(output.html);
  const safeCss = output.css.replace(/<\/style/gi, "<\\/style");
  const document = `<!doctype html><html lang="fa"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; img-src https://images.unsplash.com; font-src https://fonts.gstatic.com; style-src 'unsafe-inline' https://fonts.googleapis.com; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="styles.css"></head><body>${safeHtml}</body></html>`;
  const previewHtml = document.replace(
    '<link rel="stylesheet" href="styles.css">',
    `<style>${safeCss}</style>`,
  );

  return {
    title,
    summary: output.summary.trim(),
    files: [
      { path: "index.html", content: document },
      { path: "styles.css", content: output.css },
    ],
    previewHtml,
  };
}
