import { describe, expect, it } from "vitest";
import { scanProgress } from "../../supabase/functions/_shared/progress";
import { applyEvent, startProgress, withPhase } from "@/lib/ai/progress";

const full = JSON.stringify({
  title: "فروشگاه گل",
  summary: "ساخته شد",
  kind: "web",
  files: [
    { path: "index.html", content: "<html>\n<body>\nسلام\n</body>\n</html>" },
    { path: "style.css", content: "body{margin:0}\n" },
    { path: "app.js", content: 'console.log("x")' },
  ],
});

describe("scanProgress", () => {
  it("reads the title and every file of a finished answer", () => {
    const progress = scanProgress(full, true);
    expect(progress.title).toBe("فروشگاه گل");
    expect(progress.files.map((f) => f.path)).toEqual(["index.html", "style.css", "app.js"]);
    expect(progress.files.every((f) => f.done)).toBe(true);
    expect(progress.files[0]?.lines).toBe(5);
    expect(progress.files[1]?.lines).toBe(2);
    expect(progress.files[2]?.lines).toBe(1);
    expect(progress.files[0]?.chars).toBeLessThan(full.length);
  });

  it("reports the file being written as not done and earlier files as done", () => {
    const cut = full.slice(0, full.indexOf('"app.js"') + 40);
    const progress = scanProgress(cut);
    expect(progress.files.map((f) => [f.path, f.done])).toEqual([["index.html", true], ["style.css", true], ["app.js", false]]);
  });

  it("works on a half-written first file and on text with no files yet", () => {
    expect(scanProgress('{"title":"Hi","summ').files).toEqual([]);
    expect(scanProgress('{"title":"Hi","summ').title).toBe("Hi");
    const partial = scanProgress('{"files":[{"path":"index.html","content":"<html>\\n<bo');
    expect(partial.files).toEqual([{ path: "index.html", chars: 11, lines: 2, done: false }]);
  });

  it("is not fooled by the word path inside file contents", () => {
    const tricky = JSON.stringify({ files: [{ path: "a.js", content: 'const x = {"path": "fake.js"};' }, { path: "b.js", content: "1" }] });
    expect(scanProgress(tricky, true).files.map((f) => f.path)).toEqual(["a.js", "b.js"]);
  });

  it("handles escaped characters in the path and an empty answer", () => {
    expect(scanProgress('{"files":[{"path":"src/\\u0061.ts","content":"x"}]}', true).files[0]?.path).toBe("src/a.ts");
    expect(scanProgress("")).toEqual({ title: null, files: [], chars: 0 });
  });
});

describe("progress state", () => {
  it("moves through the phases and keeps the model name", () => {
    let state = startProgress(1000);
    expect(state.phase).toBe("preparing");
    state = applyEvent(state, { type: "phase", phase: "reading" });
    state = applyEvent(state, { type: "phase", phase: "writing", model: "models/gemini-2.5-flash" });
    expect(state.phase).toBe("writing");
    expect(state.model).toBe("gemini-2.5-flash");
  });

  it("stores progress events and ignores malformed ones", () => {
    let state = startProgress();
    state = applyEvent(state, { type: "progress", title: "T", chars: 50, files: [{ path: "a", chars: 5, lines: 1, done: false }, { bad: true }] });
    expect(state.files.length).toBe(1);
    expect(state.title).toBe("T");
    expect(applyEvent(state, null)).toBe(state);
    expect(applyEvent(state, { type: "phase", phase: "nope" })).toBe(state);
    expect(applyEvent(state, { type: "weird" })).toBe(state);
  });

  it("clears what was written when the server retries with another model", () => {
    let state = applyEvent(startProgress(), { type: "progress", title: "T", chars: 50, files: [{ path: "a", chars: 5, lines: 1, done: false }] });
    state = applyEvent(state, { type: "phase", phase: "retrying" });
    expect(state.files).toEqual([]);
    expect(state.phase).toBe("retrying");
  });

  it("does not fall back from finalizing when a late progress event arrives", () => {
    let state = withPhase(startProgress(), "finalizing");
    state = applyEvent(state, { type: "progress", title: null, chars: 1, files: [] });
    expect(state.phase).toBe("finalizing");
  });
});
