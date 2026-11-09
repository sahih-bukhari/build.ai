// Files a person attaches to a request: code and text files of any language, ZIP archives (unpacked here in the
// browser and sent as text), images and PDFs (sent to the model as they are). Nothing is uploaded anywhere else.
// Unit tested in src/test/reference-files.test.ts.

export const MAX_ATTACHMENTS = 5;
export const MAX_MEDIA = 3;
export const MAX_TEXT_FILE_BYTES = 600_000; // one plain file
export const MAX_TEXT_CHARS = 120_000; // text kept per attachment (about 34k tokens)
export const MAX_TEXT_TOTAL_CHARS = 200_000; // text of all attachments together
export const MAX_ZIP_BYTES = 15_000_000;
export const MAX_ZIP_ENTRIES = 4_000;
export const MAX_ZIP_ENTRY_BYTES = 300_000;
export const MAX_ZIP_READ_BYTES = 10_000_000;
export const MAX_MEDIA_BYTES = 4_000_000;
export const MAX_MEDIA_TOTAL_BYTES = 6_000_000;
const CHARS_PER_TOKEN = 3.5;
const MEDIA_TOKENS = 1_500;

export interface TextAttachment {
  id: string;
  kind: "text";
  name: string;
  content: string;
  /** How many files a ZIP contributed (1 for a plain file). */
  fileCount: number;
  /** Something the person should know, such as "N files were left out". */
  note?: string;
}

export interface MediaAttachment {
  id: string;
  kind: "media";
  name: string;
  mimeType: string;
  /** Base64 without the data: prefix. */
  data: string;
  size: number;
}

export type Attachment = TextAttachment | MediaAttachment;
export interface ReferenceFile { name: string; content: string }
export interface MediaFile { name: string; mimeType: string; data: string }

const IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const UNSUPPORTED_MESSAGE = "این نوع فایل پشتیبانی نمی‌شود. فایل کد یا متن، ZIP، تصویر (PNG، JPG، WebP، GIF) و PDF را بفرستید؛ فایل Word یا Excel را به PDF یا متن تبدیل کنید.";

export function estimateTokens(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

export function attachmentTokens(attachment: Attachment): number {
  return attachment.kind === "text" ? estimateTokens(attachment.content.length) : MEDIA_TOKENS;
}

// ---------- what to leave out of a ZIP ----------
const SKIPPED_DIRECTORY = /(^|\/)(node_modules|\.git|dist|build|out|\.next|\.nuxt|\.svelte-kit|\.output|coverage|__pycache__|\.venv|venv|env|vendor|target|\.idea|\.vscode|\.turbo|\.cache|\.gradle|Pods|bin|obj)\//i;
const SKIPPED_FILE = /(^|\/)(\.DS_Store|Thumbs\.db|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|composer\.lock|Cargo\.lock|poetry\.lock|Gemfile\.lock)$/i;
const SKIPPED_SUFFIX = /\.(min\.js|min\.css|map|png|jpe?g|gif|webp|ico|bmp|tiff?|psd|woff2?|ttf|otf|eot|mp[34]|mov|avi|mkv|webm|wav|ogg|zip|gz|tgz|tar|rar|7z|pdf|exe|dll|so|dylib|class|jar|war|pyc|o|a|bin|dat|db|sqlite3?|apk|aab|ipa|iso|dmg)$/i;
const SECRET_FILE = /(^|\/)\.env(\.[^/]*)?$/i;
const SAFE_ENV_FILE = /(^|\/)\.env\.(example|sample|template|dist)$/i;

export function isSkippedPath(path: string): boolean {
  if (SECRET_FILE.test(path) && !SAFE_ENV_FILE.test(path)) return true; // secrets are never sent
  return SKIPPED_DIRECTORY.test(path) || SKIPPED_FILE.test(path) || SKIPPED_SUFFIX.test(path);
}

/** Cleans a path read from a ZIP; returns null for anything unsafe or silly. */
export function cleanZipPath(raw: string): string | null {
  const path = raw.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "");
  if (!path || path.length > 240 || path.split("/").some((part) => part === ".." || part === "")) return null;
  return path;
}

/** Lower numbers come first when the budget is too small for everything. */
export function priorityOf(path: string): number {
  const file = path.split("/").pop() ?? path;
  if (/^(package\.json|pyproject\.toml|requirements\.txt|composer\.json|pubspec\.yaml|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(\.kts)?|README(\.[a-z]+)?|index\.html)$/i.test(file)) return 0;
  if (/^(vite|next|nuxt|svelte|astro|tailwind|postcss|tsconfig|jsconfig|webpack|rollup|eslint)[\w.-]*\.(c?js|mjs|ts|json)$|^Dockerfile$|^docker-compose\.[a-z]+$|^\.env\.(example|sample|template|dist)$/i.test(file)) return 1;
  if (/(^|\/)(src|app|pages|lib|components|routes|server|api|backend|frontend|public)\//i.test(path) || /^(main|index|app|server)\.[a-z]+$/i.test(file)) return 2;
  if (/(^|\/)(tests?|__tests__|docs?|examples?|fixtures?|migrations)\//i.test(path) || /\.(test|spec)\.[a-z]+$/i.test(file) || /\.(svg|json|csv|lock)$/i.test(file)) return 4;
  return 3;
}

function lineCount(text: string): number {
  return text ? text.split("\n").length : 0;
}

export function buildArchiveText(
  name: string,
  files: { path: string; content: string }[],
  leftOut: string[],
  limit = MAX_TEXT_CHARS,
): { text: string; included: number; skipped: string[] } {
  const ordered = [...files].sort((a, b) => priorityOf(a.path) - priorityOf(b.path) || a.path.localeCompare(b.path));
  const header = (list: typeof ordered, skipped: string[]) => {
    const listing = list.map((file) => `- ${file.path} (${lineCount(file.content)} lines)`).join("\n");
    const missing = skipped.length ? `\nNot included: ${skipped.slice(0, 40).join(", ")}${skipped.length > 40 ? ` and ${skipped.length - 40} more` : ""}` : "";
    return `ZIP archive "${name}": ${list.length} files included${skipped.length ? `, ${skipped.length} not included` : ""}.\nFiles:\n${listing}${missing}\n`;
  };
  const skipped = [...leftOut];
  const chosen: typeof ordered = [];
  let used = 0;
  for (const file of ordered) {
    const cost = file.content.length + file.path.length + 20;
    if (used + cost > limit - 2_000 - chosen.length * 60) { skipped.push(file.path); continue; }
    chosen.push(file);
    used += cost;
  }
  const body = chosen.map((file) => `\n=== ${file.path} ===\n${file.content}`).join("\n");
  return { text: header(chosen, skipped) + body, included: chosen.length, skipped };
}

// ---------- reading ----------
function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** True when the bytes are valid UTF-8 text without binary markers. */
export function decodeText(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return text.slice(0, 8_000).includes("\0") ? null : text;
  } catch {
    return null;
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function extensionOf(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

async function readZip(file: File): Promise<TextAttachment> {
  if (file.size > MAX_ZIP_BYTES) throw new Error("حجم ZIP باید کمتر از ۱۵ مگابایت باشد.");
  const { default: JSZip } = await import("jszip");
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new Error("فایل ZIP خوانده نشد؛ شاید خراب یا رمزدار باشد.");
  }
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length > MAX_ZIP_ENTRIES) throw new Error(`این ZIP بیش از ${MAX_ZIP_ENTRIES.toLocaleString("fa-IR")} فایل دارد. فقط بخش مهم پروژه را ZIP کنید.`);

  const files: { path: string; content: string }[] = [];
  const leftOut: string[] = [];
  let readBytes = 0;
  for (const entry of entries) {
    const path = cleanZipPath(entry.name);
    if (!path || isSkippedPath(path)) continue; // library folders, images, lock files and secrets are expected to be absent
    const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
    if (typeof size !== "number" || size > MAX_ZIP_ENTRY_BYTES || readBytes + size > MAX_ZIP_READ_BYTES) { leftOut.push(path); continue; }
    readBytes += size;
    const text = decodeText(await entry.async("uint8array"));
    if (text === null || !text.trim()) { leftOut.push(path); continue; }
    files.push({ path, content: text });
  }
  if (!files.length) throw new Error("در این ZIP فایل متنی یا کدی پیدا نشد.");

  const built = buildArchiveText(file.name, files, leftOut);
  return {
    id: newId(),
    kind: "text",
    name: file.name.slice(0, 120),
    content: built.text,
    fileCount: built.included,
    ...(built.skipped.length ? { note: `${built.skipped.length.toLocaleString("fa-IR")} فایل وارد نشد (بزرگ، باینری یا بیش از سقف حجم)` } : {}),
  };
}

export async function readAttachment(file: File): Promise<Attachment> {
  const name = file.name.slice(0, 120) || "file";
  const extension = extensionOf(name);

  if (extension === "zip" || file.type === "application/zip" || file.type === "application/x-zip-compressed") return readZip(file);

  const imageType = IMAGE_TYPES[extension] ?? (Object.values(IMAGE_TYPES).includes(file.type) ? file.type : null);
  if (imageType || extension === "pdf" || file.type === "application/pdf") {
    if (file.size > MAX_MEDIA_BYTES) throw new Error("حجم تصویر یا PDF باید کمتر از ۴ مگابایت باشد.");
    return { id: newId(), kind: "media", name, mimeType: imageType ?? "application/pdf", data: toBase64(new Uint8Array(await file.arrayBuffer())), size: file.size };
  }

  if (file.size > MAX_TEXT_FILE_BYTES) throw new Error("حجم فایل متنی باید کمتر از ۶۰۰ کیلوبایت باشد؛ آن را ZIP کنید یا بخش مهمش را بفرستید.");
  const text = decodeText(new Uint8Array(await file.arrayBuffer()));
  if (text === null) throw new Error(UNSUPPORTED_MESSAGE);
  if (!text.trim()) throw new Error("فایل خالی است.");
  const truncated = text.length > MAX_TEXT_CHARS;
  return {
    id: newId(),
    kind: "text",
    name,
    content: truncated ? `${text.slice(0, MAX_TEXT_CHARS)}\n… [rest of the file was cut]` : text,
    fileCount: 1,
    ...(truncated ? { note: "فقط بخش اول فایل فرستاده می‌شود" } : {}),
  };
}

/** Throws a Persian message when adding `incoming` would break a limit. */
export function checkCanAdd(existing: Attachment[], incoming: Attachment): void {
  if (existing.length >= MAX_ATTACHMENTS) throw new Error(`حداکثر ${MAX_ATTACHMENTS.toLocaleString("fa-IR")} فایل را می‌توانید همزمان بفرستید.`);
  if (incoming.kind === "media") {
    const media = existing.filter((item): item is MediaAttachment => item.kind === "media");
    if (media.length >= MAX_MEDIA) throw new Error(`حداکثر ${MAX_MEDIA.toLocaleString("fa-IR")} تصویر یا PDF مجاز است.`);
    if (media.reduce((sum, item) => sum + item.size, 0) + incoming.size > MAX_MEDIA_TOTAL_BYTES) throw new Error("مجموع حجم تصویرها و PDFها باید کمتر از ۶ مگابایت باشد.");
  } else {
    const chars = existing.reduce((sum, item) => sum + (item.kind === "text" ? item.content.length : 0), 0);
    if (chars + incoming.content.length > MAX_TEXT_TOTAL_CHARS) throw new Error("حجم کل فایل‌های متنی زیاد است. بعضی را حذف کنید یا ZIP کوچک‌تری بفرستید.");
  }
}

export function splitAttachments(attachments: Attachment[]): { references: ReferenceFile[]; media: MediaFile[] } {
  return {
    references: attachments.flatMap((item) => (item.kind === "text" ? [{ name: item.name, content: item.content }] : [])),
    media: attachments.flatMap((item) => (item.kind === "media" ? [{ name: item.name, mimeType: item.mimeType, data: item.data }] : [])),
  };
}
