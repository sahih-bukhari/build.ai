export interface ProjectFile {
  path: string;
  content: string;
}

export interface GenerationResult {
  title: string;
  summary: string;
  files: ProjectFile[];
  /** Complete document displayed inside the sandboxed preview iframe. */
  previewHtml: string;
  model?: string;
  createdAt?: string;
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
  | "INVALID_OUTPUT";

export type GenerateReply =
  | { ok: true; result: GenerationResult }
  | { ok: false; code: GenerateErrorCode };
