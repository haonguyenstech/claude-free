// SSE over a Web ReadableStream — the route-handler replacement for the proxy's ev()/res.write()
// (claude-proxy.js:232) and res.end() (287/289/553). All deferred writing happens inside the
// stream's start() callback, which keeps running after the Response is returned to the client.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { SSE_HEADERS } from "./errors";

const enc = new TextEncoder();

export interface SseSink {
  // Mirrors ev(res, type, obj): emits `event: <type>\ndata: {type, ...obj}\n\n`.
  // The {type, ...obj} spread is exact — Claude Code's client reads the duplicated `type`.
  ev(type: string, obj: Record<string, unknown>): void;
  raw(s: string): void;
  close(): void;
  readonly closed: boolean;
}

// Build a streaming SSE Response. `run` receives the sink + the request's AbortSignal and drives
// the event emission; when it resolves (or throws) the stream is closed. Writes after the client
// has disconnected are swallowed (replaces safeError's headersSent crash-guard, claude-proxy.js:319).
export function makeSseResponse(
  run: (sink: SseSink, signal: AbortSignal) => void | Promise<void>,
  signal: AbortSignal,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let done = false;
      const safeEnqueue = (s: string) => {
        if (done) return;
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          done = true; // controller already closed (client gone)
        }
      };
      const sink: SseSink = {
        ev: (type, obj) => safeEnqueue(`event: ${type}\ndata: ${JSON.stringify({ type, ...obj })}\n\n`),
        raw: safeEnqueue,
        close: () => {
          if (!done) {
            done = true;
            try {
              controller.close();
            } catch {}
          }
        },
        get closed() {
          return done;
        },
      };
      Promise.resolve(run(sink, signal)).catch(() => sink.close());
    },
  });
  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}
