import type { FileProgress } from "../../../supabase/functions/_shared/progress";

// What the "building" card shows. The server sends events while it works; this turns them into one state object.

export type BuildPhase = "preparing" | "reading" | "writing" | "retrying" | "finalizing" | "saving";

export interface BuildProgress {
  phase: BuildPhase;
  title: string | null;
  files: FileProgress[];
  chars: number;
  model: string | null;
  startedAt: number;
}

export type ServerEvent =
  | { type: "phase"; phase: "reading" | "writing" | "retrying" | "finalizing"; model?: string }
  | { type: "progress"; title: string | null; files: FileProgress[]; chars: number };

export function startProgress(now = Date.now()): BuildProgress {
  return { phase: "preparing", title: null, files: [], chars: 0, model: null, startedAt: now };
}

function isFileProgress(value: unknown): value is FileProgress {
  if (!value || typeof value !== "object") return false;
  const file = value as Record<string, unknown>;
  return typeof file["path"] === "string" && typeof file["chars"] === "number" && typeof file["lines"] === "number" && typeof file["done"] === "boolean";
}

/** Applies one raw event from the server. Unknown or malformed events leave the state unchanged. */
export function applyEvent(state: BuildProgress, event: unknown): BuildProgress {
  if (!event || typeof event !== "object") return state;
  const data = event as Record<string, unknown>;
  if (data["type"] === "phase") {
    const phase = data["phase"];
    if (phase !== "reading" && phase !== "writing" && phase !== "retrying" && phase !== "finalizing") return state;
    const model = typeof data["model"] === "string" ? data["model"].replace(/^models\//, "").slice(0, 60) : state.model;
    // A retry starts the answer from scratch.
    return phase === "retrying" ? { ...state, phase, model, title: null, files: [], chars: 0 } : { ...state, phase, model };
  }
  if (data["type"] === "progress" && Array.isArray(data["files"])) {
    const files = data["files"].filter(isFileProgress).slice(0, 60);
    const title = typeof data["title"] === "string" ? data["title"] : null;
    const chars = typeof data["chars"] === "number" ? data["chars"] : state.chars;
    return { ...state, phase: state.phase === "finalizing" ? state.phase : "writing", title, files, chars };
  }
  return state;
}

export function withPhase(state: BuildProgress, phase: BuildPhase): BuildProgress {
  return { ...state, phase };
}
