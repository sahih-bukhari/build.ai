import { describe, expect, it } from "vitest";
import { canClearRetryDraft, resolveRetryAttempt } from "@/lib/ai/retry-attempt";
import type { Attachment } from "@/lib/reference-files";

describe("resolveRetryAttempt", () => {
  it("keeps files from the failed request", () => {
    const attachments: Attachment[] = [
      { id: "file-1", kind: "text", name: "brief.md", content: "brief", fileCount: 1 },
      {
        id: "file-2",
        kind: "media",
        name: "layout.png",
        mimeType: "image/png",
        data: "aW1hZ2U=",
        size: 5,
      },
    ];
    const attempt = { text: "Build this page", attachments };

    const retry = resolveRetryAttempt(attempt, "older prompt");

    expect(retry).toEqual(attempt);
    expect(retry?.attachments).not.toBe(attachments);
  });

  it("falls back to a saved prompt when no in-session attempt exists", () => {
    expect(resolveRetryAttempt(null, "  Build a portfolio  ")).toEqual({
      text: "Build a portfolio",
      attachments: [],
    });
  });

  it("does not retry an empty prompt", () => {
    expect(resolveRetryAttempt(null, "   ")).toBeNull();
  });

  it("clears only the draft that was successfully retried", () => {
    const attachment: Attachment = {
      id: "file-1",
      kind: "text",
      name: "brief.md",
      content: "brief",
      fileCount: 1,
    };
    const receipt = { succeeded: true, text: "Build this page", attachmentIds: [attachment.id] };

    expect(canClearRetryDraft(" Build this page ", [attachment], receipt)).toBe(true);
    expect(canClearRetryDraft("A newer request", [attachment], receipt)).toBe(false);
    expect(canClearRetryDraft("Build this page", [], receipt)).toBe(false);
  });
});
