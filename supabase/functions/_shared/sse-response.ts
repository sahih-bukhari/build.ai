// Turns a long-running job into a Server-Sent Events response. The job gets `emit` (send an event to the browser) and
// a signal that fires when the browser disconnects (Stop button or closed tab), and finally returns a normal JSON
// Response, which becomes the last event: {type:"result", ...} for a success, {type:"error", status, ...} otherwise.
// Pure Web APIs, so it runs in Deno and in Node (unit tested in src/test/sse-response.test.ts).

export type Emit = (event: Record<string, unknown>) => void;

export function createSseResponse(
  run: (emit: Emit, signal: AbortSignal) => Promise<Response>,
  headers: Record<string, string>,
): Response {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: Emit = (event) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };
      try {
        const response = await run(emit, abort.signal);
        const body = await response.json().catch(() => ({}));
        const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
        emit(response.ok ? { ...data, type: "result" } : { ...data, type: "error", status: response.status });
      } catch (error) {
        console.error("stream job failed", error);
        emit({ type: "error", status: 500, code: "PROVIDER_ERROR", error: "An internal error occurred while generating the project." });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch { /* already closed by a cancel */ }
      }
    },
    cancel() {
      closed = true;
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: {
      ...headers,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
