// POST /v1/messages — the hot proxy path. Ports the guard order from claude-proxy.js:1056-1102:
// access-token gate -> pause switch -> parse -> per-model disable -> backend dispatch.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { messageGuard, bearerToken, touchToken } from "@/lib/proxy/auth";
import { dashboardModelId, disabledModelSet } from "@/lib/proxy/config";
import { jsonError } from "@/lib/proxy/errors";
import { routeMessages } from "@/lib/proxy/core";
import { parseModel } from "@/lib/proxy/translate";
import { logRequest, updateRequestLogTokens } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const fetchCache = "force-no-store";

export async function POST(request: Request) {
  const t0 = Date.now();
  const blocked = messageGuard(request.headers);
  if (blocked) return blocked;

  let areq: any;
  try {
    areq = await request.json();
  } catch {
    return jsonError(400, "bad json", "invalid_request_error");
  }

  // Per-model pause switch: reject a request for a model the operator has turned off.
  const dashId = dashboardModelId(areq.model);
  if (disabledModelSet().has(dashId)) {
    return jsonError(503, "model '" + dashId + "' is disabled by the operator");
  }

  // For streams, the real token counts only arrive at the end of the SSE stream (upstream sends a
  // final usage chunk). We log the row once up front and backfill output (and real input, when the
  // upstream reports it) once the stream ends. The completion callback can fire BEFORE logId is
  // assigned below (a fast/empty stream resolves before this function returns), so stash the counts
  // and apply them the moment the row exists. All best-effort — logging must never throw or delay.
  let logId: number | undefined;
  let pending: { outputTokens: number; inputTokens?: number; ttftMs?: number; latencyMs?: number; costUsd?: number } | undefined;
  const isStream = !!areq.stream;
  // TTFT + true latency: the upstream reports the absolute time of the first and last streamed byte;
  // t0 (request received) is owned here. firstByteAt-t0 is the time-to-first-token; lastByteAt-t0 is
  // the full duration (the up-front latency for a stream only covers time-to-response-start, so we
  // replace it at stream end with the real total). Works across every backend.
  const backfill = (info: { outputTokens: number; inputTokens?: number; firstByteAt?: number; lastByteAt?: number; costUsd?: number }) => {
    const ttftMs = info.firstByteAt ? Math.max(0, info.firstByteAt - t0) : undefined;
    const latencyMs = info.lastByteAt ? Math.max(0, info.lastByteAt - t0) : undefined;
    if (logId != null) {
      try {
        updateRequestLogTokens(logId, info.outputTokens, info.inputTokens, ttftMs, latencyMs, info.costUsd);
      } catch {}
    } else {
      pending = { outputTokens: info.outputTokens, inputTokens: info.inputTokens, ttftMs, latencyMs, costUsd: info.costUsd };
    }
  };

  // Passed for non-stream requests too: the non-stream path reports real usage (and gateway cost)
  // once the upstream body is parsed, replacing the rough up-front estimate via `pending`.
  const res = await routeMessages(areq, request.headers, request.signal, backfill);

  // Best-effort usage logging (never breaks the request), exactly one row per request. For streams,
  // status/latency are at response-start; output tokens start null and are backfilled at stream end.
  try {
    const token = bearerToken(request.headers);
    touchToken(token);
    logId = logRequest({
      token,
      model: areq.model ?? null,
      backend: parseModel(areq.model).backend,
      status: res.status,
      latencyMs: Date.now() - t0,
      inputTokens: Math.ceil(JSON.stringify(areq.messages || "").length / 4),
      outputTokens: null,
      stream: isStream ? 1 : 0,
    });
    // If the stream already finished before the row existed, apply its counts now.
    if (pending && logId != null) {
      updateRequestLogTokens(logId, pending.outputTokens, pending.inputTokens, pending.ttftMs, pending.latencyMs, pending.costUsd);
    }
  } catch {}

  return res;
}
