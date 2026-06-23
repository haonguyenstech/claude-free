// Error responses + SSE headers for route handlers.

// JSON error in the Anthropic error envelope. Replaces res.writeHead(status)+res.end(...) and the
// happy path of safeError (claude-proxy.js:322-327). Use only BEFORE a stream has begun — once a
// 200 SSE stream is mid-flight the status can't change (see sse.ts for the mid-stream path).
export function jsonError(status: number, message: string, type = "api_error"): Response {
  return Response.json(
    { type: "error", error: { type, message } },
    { status, headers: { "content-type": "application/json" } },
  );
}

// Headers for an SSE stream. no-transform + x-accel-buffering:no stop intermediaries (nginx, the
// Next/host proxy) from buffering or gzipping the event stream, which would stall token delivery.
export const SSE_HEADERS: Record<string, string> = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};
