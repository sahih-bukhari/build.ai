export interface ProjectFile {
  path: string;
  content: string;
}

export type DatabaseOp = "create" | "read" | "update" | "delete";

/** A collection of the project's built-in database and what VISITORS of the generated site may do with it. */
export interface DatabaseCollection {
  name: string;
  ops: DatabaseOp[];
}

/** "web" = a static site with a live preview; "project" = code in any language to download and run (no preview). */
export type ProjectKind = "web" | "project";

export interface GenerationResult {
  title: string;
  summary: string;
  kind?: ProjectKind;
  files: ProjectFile[];
  /** Complete document displayed inside the sandboxed preview iframe. Empty for a project without a live preview. */
  previewHtml: string;
  model?: string;
  createdAt?: string;
  /** Present when the site uses the built-in database (its files then include the server-built db.js). */
  database?: { collections: DatabaseCollection[] };
}

/** What a build did, shown under the assistant's message (derived from the result, never from the model's text). */
export interface MessageActivity {
  kind: ProjectKind;
  files: { path: string; lines: number }[];
  collections: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  /** A plain notice (for example "stopped"), not an error and not part of the conversation sent to the model. */
  notice?: boolean;
  activity?: MessageActivity;
  parts?: { type: "text"; text: string }[];
}

export type GenerateErrorCode =
  | "USER_DAILY_LIMIT"
  | "PROJECT_DAILY_LIMIT"
  | "RATE_LIMITED"
  | "NO_CREDITS"
  | "PROVIDER_ERROR"
  | "INVALID_OUTPUT"
  | "DATABASE_ERROR"
  | "CANCELLED";

export type GenerateReply =
  | { ok: true; result: GenerationResult; message: ChatMessage }
  | { ok: false; code: GenerateErrorCode };
