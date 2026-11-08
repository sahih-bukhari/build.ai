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

export interface GenerationResult {
  title: string;
  summary: string;
  files: ProjectFile[];
  /** Complete document displayed inside the sandboxed preview iframe. */
  previewHtml: string;
  model?: string;
  createdAt?: string;
  /** Present when the site uses the built-in database (its files then include the server-built db.js). */
  database?: { collections: DatabaseCollection[] };
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  parts?: { type: "text"; text: string }[];
}

export type GenerateErrorCode =
  | "USER_DAILY_LIMIT"
  | "PROJECT_DAILY_LIMIT"
  | "RATE_LIMITED"
  | "NO_CREDITS"
  | "PROVIDER_ERROR"
  | "INVALID_OUTPUT"
  | "DATABASE_ERROR";

export type GenerateReply =
  | { ok: true; result: GenerationResult }
  | { ok: false; code: GenerateErrorCode };
