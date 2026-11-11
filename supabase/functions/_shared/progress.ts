// Reads the model's answer while it is still being written and reports what exists so far: the title and, for every
// file, its path, how much has been written and whether it is finished. The numbers come from the real text, so the
// progress shown to the user is true, never invented. Pure logic (unit tested in src/test/progress.test.ts).

export interface FileProgress {
  path: string;
  chars: number;
  lines: number;
  done: boolean;
}

export interface Progress {
  title: string | null;
  files: FileProgress[];
  chars: number;
}

const STRING = '"((?:[^"\\\\]|\\\\.)*)"';
const TITLE = new RegExp(`"title"\\s*:\\s*${STRING}`);
const FILES_START = /"files"\s*:\s*\[/;
const PATH = new RegExp(`"path"\\s*:\\s*${STRING}`, "g");
const CONTENT_START = /"content"\s*:\s*"/g;

function decode(raw: string, max: number): string {
  try {
    return String(JSON.parse(`"${raw}"`)).slice(0, max);
  } catch {
    return raw.slice(0, max);
  }
}

function countLines(raw: string): number {
  let lines = 1;
  for (let index = raw.indexOf("\\n"); index !== -1; index = raw.indexOf("\\n", index + 2)) lines += 1;
  return lines;
}

/** `complete` marks every file as finished (the whole answer has arrived). */
export function scanProgress(text: string, complete = false): Progress {
  const title = text.match(TITLE)?.[1];
  const start = text.search(FILES_START);
  const files: FileProgress[] = [];
  if (start !== -1) {
    const body = text.slice(start);
    const paths = [...body.matchAll(PATH)];
    for (const [index, match] of paths.entries()) {
      const path = decode(match[1] ?? "", 200);
      if (!path) continue;
      const from = (match.index ?? 0) + match[0].length;
      const to = paths[index + 1]?.index ?? body.length;
      const segment = body.slice(from, to);
      CONTENT_START.lastIndex = 0;
      const opened = CONTENT_START.exec(segment);
      const content = opened ? segment.slice(opened.index + opened[0].length) : "";
      // The stretch up to the next file also holds the closing quote, brace and comma: a handful of characters.
      const trimmed = index < paths.length - 1 ? content.replace(/"\s*}\s*,\s*{\s*$/, "") : content;
      files.push({
        path,
        chars: trimmed.length,
        lines: trimmed ? countLines(trimmed) : 0,
        done: complete || index < paths.length - 1,
      });
    }
  }
  return { title: title ? decode(title, 200) : null, files, chars: text.length };
}
