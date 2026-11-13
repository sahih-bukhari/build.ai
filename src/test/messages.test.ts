import { describe, expect, it } from "vitest";
import { dropFailedAttempt } from "@/lib/ai/messages";

const user = (content: string) => ({ role: "user", content });
const failed = { role: "assistant", content: "failed", error: true };
const stopped = { role: "assistant", content: "stopped", notice: true };
const done = { role: "assistant", content: "built" };

describe("dropFailedAttempt", () => {
  it("removes a failed attempt of the same request", () => {
    expect(dropFailedAttempt([user("a"), done, user("b"), failed], "b")).toEqual([user("a"), done]);
    expect(dropFailedAttempt([user("b"), failed, failed, stopped], " b ")).toEqual([]);
  });

  it("also removes a message that never got any answer", () => {
    expect(dropFailedAttempt([user("a"), done, user("b")], "b")).toEqual([user("a"), done]);
  });

  it("keeps everything when the request is different or the last build succeeded", () => {
    const history = [user("a"), done, user("b"), failed];
    expect(dropFailedAttempt(history, "c")).toBe(history);
    const ok = [user("a"), done];
    expect(dropFailedAttempt(ok, "a")).toBe(ok); // a repeated request after a success is a new request
  });
});
