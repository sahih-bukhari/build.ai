import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  attachmentTokens, buildArchiveText, checkCanAdd, cleanZipPath, decodeText, estimateTokens, isSkippedPath,
  priorityOf, readAttachment, splitAttachments, type Attachment,
} from "@/lib/reference-files";

const file = (content: BlobPart, name: string, type = "") => new File([content], name, { type });
const text = (content: string, name = "a.txt"): Attachment => ({ id: name, kind: "text", name, content, fileCount: 1 });
const media = (size: number, name = "a.png"): Attachment => ({ id: name, kind: "media", name, mimeType: "image/png", data: "AAAA", size });

async function zipOf(entries: Record<string, string | Uint8Array>, name = "project.zip"): Promise<File> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) zip.file(path, content);
  return file(await zip.generateAsync({ type: "uint8array" }), name, "application/zip");
}

describe("path rules", () => {
  it("skips libraries, build output, binaries, lock files and secrets", () => {
    for (const path of ["node_modules/x/index.js", "a/node_modules/y.js", ".git/config", "dist/app.js", "logo.png", "font.woff2", "package-lock.json", "app.min.js", "x.map", ".env", ".env.local", "src/.env.production", "__pycache__/a.pyc", "build/out.txt"]) {
      expect(isSkippedPath(path)).toBe(true);
    }
  });

  it("keeps source files and the safe env example", () => {
    for (const path of ["src/main.py", "index.html", "package.json", "README.md", ".env.example", "app/Http/Controller.php", "lib/utils.dart", "schema.sql", "Dockerfile"]) {
      expect(isSkippedPath(path)).toBe(false);
    }
  });

  it("cleans zip paths and rejects traversal", () => {
    expect(cleanZipPath("./src\\a.ts")).toBe("src/a.ts");
    expect(cleanZipPath("/etc/passwd")).toBe("etc/passwd");
    expect(cleanZipPath("../x")).toBeNull();
    expect(cleanZipPath("a/../b")).toBeNull();
    expect(cleanZipPath("")).toBeNull();
  });

  it("puts the project manifest and README before ordinary files, and tests last", () => {
    expect(priorityOf("package.json")).toBeLessThan(priorityOf("src/a.ts"));
    expect(priorityOf("src/a.ts")).toBeLessThan(priorityOf("notes.txt"));
    expect(priorityOf("notes.txt")).toBeLessThan(priorityOf("tests/a.test.ts"));
    expect(priorityOf("README.md")).toBe(0);
  });
});

describe("decodeText", () => {
  it("reads utf-8 text including Persian and refuses binary", () => {
    expect(decodeText(new TextEncoder().encode("سلام دنیا"))).toBe("سلام دنیا");
    expect(decodeText(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0xff]))).toBeNull();
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0xfd]))).toBeNull();
  });
});

describe("buildArchiveText", () => {
  it("lists the files and puts the important ones first", () => {
    const out = buildArchiveText("p.zip", [{ path: "tests/a.test.ts", content: "t" }, { path: "src/a.ts", content: "a" }, { path: "package.json", content: "{}" }], []);
    expect(out.included).toBe(3);
    expect(out.text.indexOf("=== package.json")).toBeLessThan(out.text.indexOf("=== src/a.ts"));
    expect(out.text.indexOf("=== src/a.ts")).toBeLessThan(out.text.indexOf("=== tests/a.test.ts"));
    expect(out.text).toContain("3 files included");
  });

  it("drops what does not fit the budget, lowest priority first, and says so", () => {
    const big = "x".repeat(6000);
    const out = buildArchiveText("p.zip", [
      { path: "package.json", content: big }, { path: "src/a.ts", content: big }, { path: "tests/a.test.ts", content: big },
    ], ["image.png"], 15_000);
    expect(out.included).toBe(2);
    expect(out.skipped).toContain("tests/a.test.ts");
    expect(out.skipped).toContain("image.png");
    expect(out.text).toContain("Not included:");
    expect(out.text.length).toBeLessThan(15_000);
  });
});

describe("readAttachment", () => {
  it("reads code in any language as text", async () => {
    const a = await readAttachment(file("print('سلام')\n", "main.py"));
    expect(a.kind === "text" && a.content.includes("سلام")).toBe(true);
    const b = await readAttachment(file("SELECT 1;", "schema.sql"));
    expect(b.kind).toBe("text");
    const c = await readAttachment(file("FROM node:20", "Dockerfile"));
    expect(c.kind).toBe("text");
  });

  it("sends images and PDFs as media with a base64 payload", async () => {
    const png = await readAttachment(file(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "shot.png", "image/png"));
    expect(png.kind === "media" && png.mimeType === "image/png" && png.data === "iVBORw0KGgo=").toBe(true);
    const pdf = await readAttachment(file(new Uint8Array([37, 80, 68, 70]), "doc.pdf"));
    expect(pdf.kind === "media" && pdf.mimeType === "application/pdf").toBe(true);
  });

  it("explains unsupported or oversized files", async () => {
    await expect_rejects(readAttachment(file(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0xff, 0xfe]), "report.docx")), "پشتیبانی");
    await expect_rejects(readAttachment(file("   ", "empty.txt")), "خالی");
    await expect_rejects(readAttachment(file(new Uint8Array(4_100_000), "big.png", "image/png")), "۴ مگابایت");
  });

  it("cuts a very long text file and says so", async () => {
    const a = await readAttachment(file("a".repeat(200_000), "long.txt"));
    expect(a.kind === "text" && a.content.length < 121_000 && Boolean(a.note)).toBe(true);
  });

  it("unpacks a zip: keeps source, leaves out libraries, images and secrets", async () => {
    const zip = await zipOf({
      "app/package.json": '{"name":"x"}',
      "app/src/index.js": "console.log('hi')",
      "app/src/ui.py": "print('سلام')",
      "app/node_modules/lib/index.js": "SECRET LIB",
      "app/logo.png": new Uint8Array([137, 80, 78, 71, 0, 1, 2]),
      "app/.env": "API_KEY=abc",
      "app/.env.example": "API_KEY=",
      "app/data.xyz": new Uint8Array([0, 1, 2, 3, 255, 254]),
    });
    const a = await readAttachment(zip);
    expect(a.kind).toBe("text");
    if (a.kind !== "text") return;
    expect(a.fileCount).toBe(4);
    expect(a.content).toContain("=== app/src/index.js ===");
    expect(a.content).toContain("سلام");
    expect(a.content).toContain("app/.env.example");
    expect(a.content).not.toContain("SECRET LIB");
    expect(a.content).not.toContain("API_KEY=abc");
    expect(a.note).toBeDefined(); // data.xyz could not be read as text
  });

  it("rejects a zip with nothing readable and a file that is not a zip", async () => {
    await expect_rejects(readAttachment(await zipOf({ "a.png": new Uint8Array([137, 80, 1]) })), "فایل متنی");
    await expect_rejects(readAttachment(file("not a zip", "fake.zip", "application/zip")), "ZIP");
  });
});

async function expect_rejects(promise: Promise<unknown>, fragment: string) {
  let message = "";
  try { await promise; } catch (error) { message = error instanceof Error ? error.message : String(error); }
  expect(message.includes(fragment)).toBe(true);
}

describe("limits", () => {
  it("allows at most 5 attachments and 3 media files", () => {
    const five = Array.from({ length: 5 }, (_, i) => text("x", `f${i}.txt`));
    expect(() => checkCanAdd(five, text("y", "g.txt"))).toThrow();
    const three = [media(10, "1.png"), media(10, "2.png"), media(10, "3.png")];
    expect(() => checkCanAdd(three, media(10, "4.png"))).toThrow();
    expect(() => checkCanAdd(three, text("ok"))).not.toThrow();
  });

  it("limits the total size of media and of text", () => {
    expect(() => checkCanAdd([media(3_500_000)], media(3_000_000, "b.png"))).toThrow();
    expect(() => checkCanAdd([text("a".repeat(150_000))], text("b".repeat(60_000), "b.txt"))).toThrow();
    expect(() => checkCanAdd([text("a".repeat(100_000))], text("b".repeat(60_000), "b.txt"))).not.toThrow();
  });
});

describe("splitting and token estimates", () => {
  it("separates text references from media", () => {
    const out = splitAttachments([text("hello", "a.txt"), media(5, "b.png")]);
    expect(out.references).toEqual([{ name: "a.txt", content: "hello" }]);
    expect(out.media).toEqual([{ name: "b.png", mimeType: "image/png", data: "AAAA" }]);
  });

  it("estimates tokens", () => {
    expect(estimateTokens(3500)).toBe(1000);
    expect(attachmentTokens(text("a".repeat(7000)))).toBe(2000);
    expect(attachmentTokens(media(1))).toBeGreaterThan(0);
  });
});
