const KEY = "aibuilder.pendingPrompt";
const TTL_MS = 15 * 60 * 1_000;

export function savePendingPrompt(text: string) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ text: text.slice(0, 4_000), savedAt: Date.now() }));
  } catch {
    // optional
  }
}

export function readPendingPrompt(): string {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return "";
    const saved = JSON.parse(raw) as { text?: unknown; savedAt?: unknown };
    if (
      typeof saved.text === "string" &&
      typeof saved.savedAt === "number" &&
      Date.now() - saved.savedAt <= TTL_MS &&
      saved.text.length <= 4_000
    )
      return saved.text;
  } catch {
    // optional
  }
  return "";
}

export function clearPendingPrompt() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // optional
  }
}
