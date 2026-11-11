// Patterns and constants shared by the app-api and ai-builder Edge Functions and by the builder app.
// Pure TypeScript with no Deno or browser APIs.

export type PublicOp = "create" | "read" | "update" | "delete";
export const PUBLIC_OPS: readonly PublicOp[] = ["create", "read", "update", "delete"];

export const KEY_PATTERN = /^pk_[a-f0-9]{48}$/;
export const COLLECTION_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Secret a visitor's browser receives when it creates a record; only its SHA-256 hash is stored. */
export const TOKEN_PATTERN = /^[a-f0-9]{48}$/;
export const MAX_COLLECTIONS = 20;
