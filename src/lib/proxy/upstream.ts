// Upstream HTTP I/O, rewritten for Web Request/Response. Ports callBackend (claude-proxy.js:384),
// forwardAnthropic (399) and streamTranslate (234). The translation algorithm in streamTranslate is
// preserved byte-for-byte — only the output sink changes from `res` to an SseSink.
/* eslint-disable @typescript-eslint/no-explicit-any */

import https from "node:https";
import { Readable, PassThrough } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import type { IncomingMessage } from "node:http";
import { mapStop } from "./translate";
import { serverKey } from "./config";
import { jsonError } from "./errors";
import { makeSseResponse, type SseSink } from "./sse";
import { forwardViaCLI } from "./cli";
import { subscriptionToken, subscriptionUsable } from "./claude-auth";
import { recordRateLimit, type RateLimitInfo } from "../db";

// Fired once when a proxied response finishes, carrying the resolved token counts so the request log
// can be backfilled. inputTokens is omitted unless the upstream reported a real (non-estimated) count.
// firstByteAt / lastByteAt are absolute epoch-ms of the first and last streamed byte; the caller
// (which owns the request start time) turns firstByteAt into a TTFT and lastByteAt into the TRUE total
// latency (for a stream, the up-front latency only covers time-to-response-start, not the decode).
// Both omitted for non-streamed responses.
export type CompleteInfo = { outputTokens: number; inputTokens?: number; firstByteAt?: number; lastByteAt?: number };
export type OnComplete = (info: CompleteInfo) => void;

// Parse the `anthropic-ratelimit-*` / `retry-after` response headers into a snapshot for the
// dashboard. Returns null when none are present (e.g. a non-Anthropic backend) so we don't record an
// empty row. Reset headers are RFC-3339 timestamps; retry-after is seconds (sent on 429s).
function parseRateLimitHeaders(h: IncomingMessage["headers"], status: number, now: number): RateLimitInfo | null {
  const num = (v: unknown): number | null => {
    const s = Array.isArray(v) ? v[0] : v;
    if (s == null || s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const resetMs = (v: unknown): number | null => {
    const s = Array.isArray(v) ? v[0] : v;
    if (!s) return null;
    const t = Date.parse(String(s));
    return Number.isFinite(t) ? t : null;
  };
  const reqRem = num(h["anthropic-ratelimit-requests-remaining"]);
  const reqLim = num(h["anthropic-ratelimit-requests-limit"]);
  // Prefer the unified tokens window; fall back to the input-tokens window if that's all that's sent.
  const tokRem = num(h["anthropic-ratelimit-tokens-remaining"]) ?? num(h["anthropic-ratelimit-input-tokens-remaining"]);
  const tokLim = num(h["anthropic-ratelimit-tokens-limit"]) ?? num(h["anthropic-ratelimit-input-tokens-limit"]);
  const retryAfter = num(h["retry-after"]);
  const resets = [
    resetMs(h["anthropic-ratelimit-requests-reset"]),
    resetMs(h["anthropic-ratelimit-tokens-reset"]),
    resetMs(h["anthropic-ratelimit-input-tokens-reset"]),
    retryAfter != null ? now + retryAfter * 1000 : null,
  ].filter((x): x is number => x != null);
  const resetAt = resets.length ? Math.min(...resets) : null;

  if (reqRem == null && reqLim == null && tokRem == null && tokLim == null && retryAfter == null && resetAt == null) {
    return null; // nothing rate-limit-related in this response
  }
  return {
    status,
    requestsRemaining: reqRem,
    requestsLimit: reqLim,
    tokensRemaining: tokRem,
    tokensLimit: tokLim,
    resetAt,
    retryAfter,
  };
}

// Sum every token the Anthropic SSE attributes to the request — fresh input, cache writes and cache
// reads all consume quota, so the real "input" cost is their sum, not bare input_tokens.
function sumInput(u: any): number {
  if (!u) return 0;
  return (
    (Number(u.input_tokens) || 0) +
    (Number(u.cache_creation_input_tokens) || 0) +
    (Number(u.cache_read_input_tokens) || 0)
  );
}

// POST an OpenAI-compatible body to an upstream and resolve with the raw Node response stream.
// Replaces the callback-style callBackend so the route handler can `await` the upstream.
export function callBackend(
  route: { host: string; path: string; backend: string },
  authHeader: string,
  oaBody: any,
  signal: AbortSignal,
): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(oaBody), "utf8");
    const headers: Record<string, string | number> = {
      "content-type": "application/json",
      authorization: authHeader,
      "content-length": payload.length,
    };
    if (route.backend === "mimo") headers["x-mimo-source"] = "mimocode-cli-free";
    const req = https.request({ host: route.host, port: 443, method: "POST", path: route.path, headers }, resolve);
    req.setTimeout(300000, () => req.destroy(new Error("upstream timeout after 300s")));
    req.on("error", reject);
    signal.addEventListener("abort", () => req.destroy(), { once: true });
    req.write(payload);
    req.end();
  });
}

// Read a Node response stream fully into a string (for error bodies / non-stream JSON). Rejects on a
// mid-stream transport error rather than resolving the partial bytes — otherwise a truncated upstream
// response could be JSON-parsed and returned to the client as if it were a complete, valid answer.
export function collectBody(ures: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let b = "";
    ures.on("data", (c) => (b += c));
    ures.on("end", () => resolve(b));
    ures.on("error", (e) => reject(e instanceof Error ? e : new Error(String(e))));
  });
}

// Raw passthrough to api.anthropic.com/v1/messages. The Anthropic Messages API is what Claude Code
// speaks natively, so the request (tools, system, streaming flag, everything) is forwarded verbatim —
// only `model` is overridden and the caller supplies the auth headers. The upstream response (JSON or
// SSE) is streamed straight back, giving 100%-fidelity Claude behaviour. Used by both the API-key path
// and the subscription (OAuth) path below.
function anthropicPassthrough(
  areq: any,
  model: string,
  signal: AbortSignal,
  authHeaders: Record<string, string>,
  reqHeaders: Headers,
  onComplete?: OnComplete,
): Promise<Response> {
  const payload = Buffer.from(JSON.stringify({ ...areq, model }), "utf8");
  const headers: Record<string, string | number> = {
    "content-type": "application/json",
    "content-length": payload.length,
    "anthropic-version": (reqHeaders.get("anthropic-version") || "2023-06-01").toString(),
    ...authHeaders,
  };
  const beta = reqHeaders.get("anthropic-beta");
  if (beta) headers["anthropic-beta"] = beta.toString();

  return new Promise<Response>((resolve) => {
    const ureq = https.request(
      { host: "api.anthropic.com", port: 443, method: "POST", path: "/v1/messages", headers },
      (ures) => {
        const ctype = (ures.headers["content-type"] as string) || "application/json";
        // Record the rate-limit snapshot from the response headers (incl. on 429s — the case the
        // dashboard most cares about). Deferred to setImmediate so the DB write never delays
        // forwarding the response bytes — this stays strictly off the hot path.
        const rl = parseRateLimitHeaders(ures.headers, ures.statusCode || 0, Date.now());
        if (rl) setImmediate(() => recordRateLimit(model, rl));
        // Streaming response + a usage sink: tap the SSE as it passes through so we can record the
        // REAL token counts Anthropic reports (message_start = input incl. cache; message_delta =
        // final cumulative output). Without this, every cli/claude streaming request — and there is
        // one per tool call and per subagent turn — would log 0 output tokens. We forward bytes
        // verbatim through a PassThrough (with backpressure) so client behaviour is unchanged.
        const tap = onComplete && /event-stream/i.test(ctype) && (ures.statusCode || 0) < 400;
        let webBody: ReadableStream<Uint8Array>;
        if (tap) {
          const pass = new PassThrough();
          // If the client cancels mid-stream the web reader destroys `pass`; a subsequent upstream
          // write would otherwise emit an unhandled 'error'. Swallow it — teardown is handled below.
          pass.on("error", () => {});
          const decoder = new StringDecoder("utf8");
          let sbuf = "";
          let outTok = 0;
          let inTok = 0;
          let firstByteAt = 0;
          let reported = false;
          const report = () => {
            if (reported) return;
            reported = true;
            try {
              onComplete!({
                outputTokens: outTok,
                inputTokens: inTok || undefined,
                firstByteAt: firstByteAt || undefined,
                lastByteAt: Date.now(),
              });
            } catch {}
          };
          const scan = (text: string) => {
            sbuf += text;
            let nl;
            while ((nl = sbuf.indexOf("\n")) >= 0) {
              const line = sbuf.slice(0, nl).trim();
              sbuf = sbuf.slice(nl + 1);
              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trim();
              if (!data || data === "[DONE]") continue;
              try {
                const j = JSON.parse(data);
                const u = j.usage || (j.message && j.message.usage);
                if (u) {
                  const i = sumInput(u);
                  if (i) inTok = i;
                  if (typeof u.output_tokens === "number") outTok = u.output_tokens;
                }
              } catch {}
            }
          };
          ures.on("data", (c: Buffer) => {
            if (!firstByteAt) firstByteAt = Date.now(); // first streamed byte → TTFT (caller owns t0)
            if (!pass.write(c)) ures.pause(); // raw bytes forwarded verbatim — client fidelity intact
            scan(decoder.write(c)); // sniff a decode-safe copy for usage; multibyte splits can't corrupt it
          });
          pass.on("drain", () => ures.resume());
          ures.on("end", () => {
            pass.end();
            report();
          });
          ures.on("error", () => {
            try {
              pass.end();
            } catch {}
            report();
          });
          webBody = Readable.toWeb(pass) as ReadableStream<Uint8Array>;
        } else {
          webBody = Readable.toWeb(ures) as ReadableStream<Uint8Array>;
        }
        resolve(
          new Response(webBody, {
            status: ures.statusCode || 502,
            headers: {
              "content-type": ctype,
              "cache-control": "no-cache",
              "x-accel-buffering": "no",
            },
          }),
        );
      },
    );
    ureq.setTimeout(300000, () => ureq.destroy(new Error("upstream timeout after 300s")));
    ureq.on("error", (e) => resolve(jsonError(502, e.message)));
    signal.addEventListener("abort", () => ureq.destroy(), { once: true });
    ureq.write(payload);
    ureq.end();
  });
}

// Native Anthropic passthrough (claude-proxy.js:399). No key -> fall back to the local claude CLI.
export function forwardAnthropic(
  reqHeaders: Headers,
  areq: any,
  model: string,
  signal: AbortSignal,
  onComplete?: OnComplete,
): Promise<Response> {
  const key = serverKey("anthropic");
  if (!key) return forwardViaCLI(areq, model, signal, onComplete);
  return anthropicPassthrough(areq, model, signal, { "x-api-key": key }, reqHeaders, onComplete);
}

// `cli/claude-*` models. To make them behave 100% like Claude (tools, subagents, streaming) we forward
// to the real Anthropic API using, in order of preference:
//   1. the host's Claude Code SUBSCRIPTION login (OAuth token) — Bearer + the oauth beta flag, exactly
//      how Claude Code itself authenticates, so no extra API key or cost;
//   2. a configured Anthropic API key (serverKey), if one is set;
//   3. the local text-only `claude -p` CLI, as a last-resort fallback when neither credential exists.
export function forwardClaudeCli(
  reqHeaders: Headers,
  areq: any,
  model: string,
  signal: AbortSignal,
  onComplete?: OnComplete,
): Promise<Response> {
  const sub = subscriptionToken();
  if (subscriptionUsable(sub)) {
    // The OAuth beta flag is required for sk-ant-oat tokens; merge it with any flag the client sent.
    const clientBeta = reqHeaders.get("anthropic-beta") || "";
    const merged = clientBeta.includes("oauth-2025-04-20")
      ? clientBeta
      : (clientBeta ? clientBeta + "," : "") + "oauth-2025-04-20";
    const h = new Headers(reqHeaders);
    h.set("anthropic-beta", merged);
    return anthropicPassthrough(areq, model, signal, { authorization: "Bearer " + sub.token }, h, onComplete);
  }
  const key = serverKey("anthropic");
  if (key) return anthropicPassthrough(areq, model, signal, { "x-api-key": key }, reqHeaders, onComplete);
  return forwardViaCLI(areq, model, signal, onComplete);
}

// Translate an upstream OpenAI-compatible SSE stream to Anthropic SSE, writing into the sink.
// Verbatim port of claude-proxy.js:234-290 (ev->sink.ev, res.end()->sink.close()).
export function streamTranslate(
  sink: SseSink,
  upstream: IncomingMessage,
  msgId: string,
  model: string,
  _inputTokens: number,
  onComplete?: OnComplete,
): Promise<void> {
  return new Promise((resolve) => {
    let reported = false;
    let firstByteAt = 0;
    // Fire the completion callback exactly once, with the resolved token counts. Best-effort: a
    // throwing callback must not break stream teardown or the proxy.
    const report = (outputTokens: number, inputTokens?: number) => {
      if (reported) return;
      reported = true;
      if (onComplete) {
        try {
          onComplete({
            outputTokens,
            inputTokens: inputTokens || undefined,
            firstByteAt: firstByteAt || undefined,
            lastByteAt: Date.now(),
          });
        } catch {}
      }
    };
    let started = false;
    let textOpen = false;
    let blockIndex = -1;
    const toolIdx: Record<string, number> = {};
    let inThink = false;
    let anyText = false;
    let reasoningBuf = "";
    let stop = "end_turn";
    let outChars = 0;
    let buf = "";
    let realOut = 0;
    let realIn = 0;
    const start = () => {
      if (started) return;
      started = true;
      sink.ev("message_start", {
        message: { id: msgId, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } },
      });
    };
    const openText = () => {
      start();
      if (!textOpen) {
        blockIndex++;
        textOpen = true;
        sink.ev("content_block_start", { index: blockIndex, content_block: { type: "text", text: "" } });
      }
    };
    const closeText = () => {
      if (textOpen) {
        sink.ev("content_block_stop", { index: blockIndex });
        textOpen = false;
      }
    };
    const emitText = (t: string) => {
      if (!t) return;
      let out = "";
      let i = 0;
      while (i < t.length) {
        if (!inThink) {
          const o = t.indexOf("<think>", i);
          if (o === -1) {
            out += t.slice(i);
            break;
          }
          out += t.slice(i, o);
          i = o + 7;
          inThink = true;
        } else {
          const c = t.indexOf("</think>", i);
          if (c === -1) {
            i = t.length;
          } else {
            i = c + 8;
            inThink = false;
          }
        }
      }
      if (out) {
        openText();
        anyText = true;
        outChars += out.length;
        sink.ev("content_block_delta", { index: blockIndex, delta: { type: "text_delta", text: out } });
      }
    };
    const onToolCall = (tc: any) => {
      start();
      const k = tc.index != null ? tc.index : 0;
      if (toolIdx[k] === undefined) {
        closeText();
        blockIndex++;
        toolIdx[k] = blockIndex;
        sink.ev("content_block_start", {
          index: blockIndex,
          content_block: { type: "tool_use", id: tc.id || "call_" + k, name: (tc.function && tc.function.name) || "", input: {} },
        });
      }
      const args = tc.function && tc.function.arguments;
      if (args) {
        outChars += args.length;
        sink.ev("content_block_delta", { index: toolIdx[k], delta: { type: "input_json_delta", partial_json: args } });
      }
    };
    upstream.on("data", (chunk) => {
      if (!firstByteAt) firstByteAt = Date.now(); // first byte from the OpenAI-compatible upstream
      buf += chunk.toString("utf8");
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let j;
        try {
          j = JSON.parse(data);
        } catch {
          continue;
        }
        if (j.usage) {
          if (j.usage.completion_tokens) realOut = j.usage.completion_tokens;
          if (j.usage.prompt_tokens) realIn = j.usage.prompt_tokens;
        }
        const ch = (j.choices && j.choices[0]) || {};
        const d = ch.delta || {};
        if (d.reasoning) reasoningBuf += d.reasoning;
        if (d.reasoning_content) reasoningBuf += d.reasoning_content;
        if (d.content) emitText(d.content);
        if (Array.isArray(d.tool_calls)) for (const tc of d.tool_calls) onToolCall(tc);
        if (ch.finish_reason) stop = mapStop(ch.finish_reason);
      }
    });
    upstream.on("end", () => {
      start();
      if (!anyText && !Object.keys(toolIdx).length && reasoningBuf) emitText(reasoningBuf);
      closeText();
      for (const k in toolIdx) sink.ev("content_block_stop", { index: toolIdx[k] });
      const outTok = realOut || Math.ceil(outChars / 4);
      sink.ev("message_delta", { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: outTok } });
      sink.ev("message_stop", {});
      sink.close();
      report(outTok, realIn);
      resolve();
    });
    upstream.on("error", () => {
      try {
        start();
        sink.ev("message_stop", {});
      } catch {}
      sink.close();
      report(realOut || Math.ceil(outChars / 4), realIn);
      resolve();
    });
  });
}
