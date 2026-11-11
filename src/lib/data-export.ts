// Pure helpers to show and export records of a project's database (unit tested in src/test/data-export.test.ts).

export interface DataRecord {
  id: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  /** true when a visitor of the generated site created it, false when the owner created it in the builder. */
  byVisitor: boolean;
}

const MAX_CSV_COLUMNS = 100;

/** Field names in the order they first appear. */
export function columnsOf(records: Pick<DataRecord, "data">[], max = MAX_CSV_COLUMNS): string[] {
  const seen = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record.data)) {
      if (seen.size >= max) return [...seen];
      seen.add(key);
    }
  }
  return [...seen];
}

/** Text shown in a table cell: short, single line, never "[object Object]". */
export function formatCell(value: unknown, maxLength = 80): string {
  let text: string;
  if (value === null || value === undefined) text = "";
  else if (typeof value === "string") text = value;
  else if (typeof value === "number" || typeof value === "boolean") text = String(value);
  else text = JSON.stringify(value) ?? "";
  text = text.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function csvCell(value: unknown): string {
  let text: string;
  if (value === null || value === undefined) text = "";
  else if (typeof value === "string") text = value;
  else if (typeof value === "number" || typeof value === "boolean") text = String(value);
  else text = JSON.stringify(value) ?? "";
  // A text that starts with = + - @ (or a tab/CR) would run as a formula when the file is opened in Excel or Sheets.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV with a UTF-8 BOM (so Excel shows Persian correctly) and CRLF line ends. */
export function recordsToCsv(records: DataRecord[]): string {
  const columns = columnsOf(records);
  const header = ["id", "created_at", "updated_at", "source", ...columns].map(csvCell).join(",");
  const lines = records.map((record) => [
    record.id,
    record.createdAt,
    record.updatedAt,
    record.byVisitor ? "visitor" : "owner",
    ...columns.map((column) => record.data[column]),
  ].map(csvCell).join(","));
  return `\uFEFF${[header, ...lines].join("\r\n")}\r\n`;
}

export function recordsToJson(records: DataRecord[]): string {
  return JSON.stringify(
    records.map((record) => ({ id: record.id, createdAt: record.createdAt, updatedAt: record.updatedAt, source: record.byVisitor ? "visitor" : "owner", data: record.data })),
    null,
    2,
  );
}

/** Parses the JSON typed in the editor. Returns the object or a Persian error message. */
export function parseRecordJson(text: string): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: "قالب JSON درست نیست؛ نام فیلدها و متن‌ها باید داخل \" \" باشند." };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false, error: "رکورد باید یک شیء باشد، مثل {\"name\": \"علی\"}." };
  if (Object.keys(value).length === 0) return { ok: false, error: "رکورد نباید خالی باشد." };
  return { ok: true, data: value as Record<string, unknown> };
}

export function safeFileName(collection: string, extension: "csv" | "json", now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return `${collection.replace(/[^a-z0-9_]/g, "")}-${day}.${extension}`;
}
