// Backend dispatch for a parsed /v1/messages request. Ports claude-proxy.js:1097-1158 (everything
// after the auth / pause / disabled-model guards). Shared by the route handler and the dashboard's
// self-test (state.ts:testModel), so both exercise the identical routing + translation path.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { parseModel, routeFor, toOpenAI, toAnthropic } from "./translate";
import { OPENROUTER_FREE_MODELS } from "./models";
import { serverKey } from "./config";
import { mimoJwt } from "./mimo";
import { callBackend, collectBody, forwardAnthropic, forwardClaudeCli, streamTranslate } from "./upstream";
import { jsonError } from "./errors";
import { makeSseResponse } from "./sse";

export async function routeMessages(
  areq: any,
  reqHeaders: Headers,
  signal: AbortSignal,
  onStreamComplete?: (info: { outputTokens: number; inputTokens?: number }) => void,
): Promise<Response> {
  const parsed = parseModel(areq.model);

  // Anthropic backend speaks the Messages API natively — forward verbatim, no OpenAI round-trip.
  if (parsed.backend === "anthropic") return forwardAnthropic(reqHeaders, areq, parsed.model, signal, onStreamComplete);
  // CLI backend: real Claude models. Forwards to api.anthropic.com using the host's Claude Code
  // subscription login (full tool/subagent support), falling back to the local `claude` CLI.
  if (parsed.backend === "cli") return forwardClaudeCli(reqHeaders, areq, parsed.model, signal, onStreamComplete);

  const oaBody = toOpenAI(areq);
  // OpenRouter free models get throttled (429) unpredictably; attach free siblings as a fallback list
  // so a 429 yields an available sibling's answer instead of a hard error (capped at 3 by OpenRouter).
  if (parsed.backend === "openrouter" && OPENROUTER_FREE_MODELS.includes(parsed.model)) {
    oaBody.models = [parsed.model, ...OPENROUTER_FREE_MODELS.filter((m) => m !== parsed.model)].slice(0, 3);
  }
  oaBody.stream = !!areq.stream;
  if (oaBody.stream) oaBody.stream_options = { include_usage: true };
  const route = routeFor(parsed.backend);
  const msgId = "msg_" + Date.now();
  const inEst = Math.ceil(JSON.stringify(areq.messages || "").length / 4);

  let authHeader = "Bearer ";
  if (parsed.backend === "tokenrouter" || parsed.backend === "openrouter" || parsed.backend === "gemini") {
    authHeader = "Bearer " + serverKey(parsed.backend);
  } else if (parsed.backend === "mimo") {
    try {
      authHeader = "Bearer " + (await mimoJwt());
    } catch (e) {
      return jsonError(502, "mimo bootstrap failed: " + (e as Error).message);
    }
  }

  let ures;
  try {
    ures = await callBackend(route, authHeader, oaBody, signal);
  } catch (e) {
    return jsonError(502, (e as Error).message);
  }

  if ((ures.statusCode ?? 0) >= 400) {
    let b: string;
    try {
      b = await collectBody(ures);
    } catch (e) {
      return jsonError(ures.statusCode || 502, (e as Error).message);
    }
    let o;
    try {
      o = JSON.parse(b);
    } catch {
      o = { message: b.slice(0, 300) };
    }
    return jsonError(ures.statusCode || 502, JSON.stringify(o));
  }

  if (areq.stream) {
    return makeSseResponse((sink) => streamTranslate(sink, ures, msgId, parsed.model, inEst, onStreamComplete), signal);
  }

  let b: string;
  try {
    b = await collectBody(ures);
  } catch (e) {
    return jsonError(502, "upstream connection error: " + (e as Error).message);
  }
  let o;
  try {
    o = JSON.parse(b);
  } catch (e) {
    return jsonError(502, "parse: " + (e as Error).message + " :: " + b.slice(0, 200));
  }
  return Response.json(toAnthropic(o));
}
