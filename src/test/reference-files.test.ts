import { describe, it, expect } from "vitest";
import { readReferenceFile, referenceSchema } from "@/lib/reference-files";

describe("Reference file validation", () => {
  it("rejects executable attachments", async () => {
    await expect(readReferenceFile(new File(["script"], "payload.exe"))).rejects.toThrow();
  });
  it("rejects oversized uploads before reading them", async () => {
    await expect(readReferenceFile(new File(["a".repeat(100001)], "brief.txt"))).rejects.toThrow();
  });
  it("caps server-side reference text", () => {
    expect(referenceSchema.safeParse({ name: "brief.txt", content: "x".repeat(12001) }).success).toBe(false);
    expect(referenceSchema.safeParse({ name: "brief.txt", content: "A florist site" }).success).toBe(true);
  });
});