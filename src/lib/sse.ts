// Incremental parser for Server-Sent Events: feed it the text chunks of a streaming response and it calls
// `onEvent` with the parsed JSON of every complete event. Handles events split across chunks, CRLF line ends,
// comment lines and multi-line data. Invalid JSON is ignored. Unit tested in src/test/sse.test.ts.

export function createSseParser(onEvent: (data: unknown) => void) {
  let buffer = "";
  let dataLines: string[] = [];

  const dispatch = () => {
    if (!dataLines.length) return;
    const raw = dataLines.join("\n");
    dataLines = [];
    try {
      onEvent(JSON.parse(raw));
    } catch { /* not JSON: skip */ }
  };

  const handleLine = (line: string) => {
    if (line === "") return dispatch();
    if (line.startsWith(":")) return; // comment / keep-alive
    if (line.startsWith("data:")) {
      const value = line.slice(5);
      dataLines.push(value.startsWith(" ") ? value.slice(1) : value);
    }
  };

  return {
    feed(chunk: string) {
      buffer += chunk;
      const lines = buffer.split(/\r\n|\n|\r(?!\n)/);
      buffer = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    },
    /** Call when the stream ends: flushes an event that was not followed by a blank line. */
    end() {
      if (buffer) handleLine(buffer.replace(/\r$/, ""));
      buffer = "";
      dispatch();
    },
  };
}
