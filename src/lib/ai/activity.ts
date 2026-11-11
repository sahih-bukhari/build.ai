import type { GenerationResult, MessageActivity } from "./types";

const MAX_FILES = 40;

/** The files and collections a build touched, for the summary under the assistant's message. */
export function activityOf(result: Pick<GenerationResult, "files" | "kind" | "database">): MessageActivity {
  return {
    kind: result.kind === "project" ? "project" : "web",
    files: result.files.slice(0, MAX_FILES).map((file) => ({ path: file.path, lines: file.content ? file.content.split("\n").length : 0 })),
    collections: (result.database?.collections ?? []).map((collection) => collection.name),
  };
}

/** Reads a stored activity back, ignoring anything that does not have the right shape. */
export function readActivity(value: unknown): MessageActivity | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row["files"])) return undefined;
  const files = row["files"].flatMap((file) => {
    if (!file || typeof file !== "object") return [];
    const item = file as Record<string, unknown>;
    return typeof item["path"] === "string" && typeof item["lines"] === "number" ? [{ path: item["path"].slice(0, 180), lines: Math.max(0, Math.round(item["lines"])) }] : [];
  }).slice(0, MAX_FILES);
  const collections = Array.isArray(row["collections"]) ? row["collections"].filter((name): name is string => typeof name === "string").map((name) => name.slice(0, 40)).slice(0, 20) : [];
  return { kind: row["kind"] === "project" ? "project" : "web", files, collections };
}
