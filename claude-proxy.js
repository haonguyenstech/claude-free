// claude-proxy — Adapter proxy: Claude Code (Anthropic Messages API) <-> free OpenAI-compatible backends.
// Cross-platform (macOS / Linux / Windows). Routes by the requested model name:
//   - Zen free models (deepseek-v4-flash-free, big-pickle, ...)  -> opencode.ai, empty bearer
//   - mimo-auto                                                  -> Xiaomi free endpoint (self-bootstrapped JWT)
//   - gemini-*                                                   -> Google AI Studio (client key)
//   - zenmux/<vendor/model>                                      -> ZenMux (client key, NATIVE Anthropic — passthrough)
//   - vendor/model[:free]                                        -> OpenRouter (client key)
// Translates Anthropic request -> OpenAI, and OpenAI response (incl. streaming SSE) -> Anthropic.
// Exception: ZenMux already speaks the Anthropic Messages API, so its requests are passed through
// untouched (no OpenAI round-trip) — preserving native streaming, tools, and the 1M context window.
const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const pathMod = require("path");

// 0 lets the OS pick any free port (no fixed :4002 to collide with the user's other servers).
// Set CLAUDE_FREE_PORT to force a specific port. The chosen port + pid are written to proxy.json
// so the picker (claude-free.js) can find and reuse this proxy.
const PORT = process.env.CLAUDE_FREE_PORT ? Number(process.env.CLAUDE_FREE_PORT) : 0;
const STATE_FILE = pathMod.join(__dirname, "proxy.json");
const ZEN_HOST = "opencode.ai";
const ZEN_PATH = "/zen/v1/chat/completions";
const DEFAULT_MODEL = process.env.ZEN_MODEL || "deepseek-v4-flash-free";
const ALLOWED = new Set(["deepseek-v4-flash-free", "north-mini-code-free", "nemotron-3-ultra-free", "mimo-v2.5-free", "big-pickle"]);
const MODEL = DEFAULT_MODEL;

// ---- MiMo free backend (Xiaomi) ----
// Two-step handshake: POST a device fingerprint to /bootstrap -> short-lived JWT -> OpenAI-compatible /chat.
// We reuse the mimocode CLI's fingerprint if present (shares its quota); otherwise we generate & cache our own,
// so mimo-auto works on any machine even without mimocode installed. JWT cached, refreshed ~5 min before expiry.
const MIMO_HOST = "api.xiaomimimo.com";
const MIMO_CHAT_PATH = "/api/free-ai/openai/chat";
const MIMO_BOOTSTRAP_PATH = "/api/free-ai/bootstrap";
// Neutral public aliases (pro/<name>) -> real subscription model ids. Keeps the gateway/provider
// out of the model name Claude Code displays and out of the picker.
const ZENMUX_WEB = {
  // free ZenMux models — billed $0 via payg (see zenmuxWebPassthrough), still need the web cookie
  "glm-5.2-free":      "z-ai/glm-5.2-free",
  "kimi-k2.7-free":    "moonshotai/kimi-k2.7-code-free",
  "step-3.7-free":     "stepfun/step-3.7-flash-free",
  "glm-4.7-free":      "z-ai/glm-4.7-flash-free",
  // paid subscription models
  "glm-5.2":           "z-ai/glm-5.2",
  "qwen3.7-max":       "qwen/qwen3.7-max",
  "kimi-k2.7-code-hs": "moonshotai/kimi-k2.7-code-highspeed",
  "grok-4.3":          "x-ai/grok-4.3",
  "step-3.7-flash":    "stepfun/step-3.7-flash",
  "deepseek-v4-pro":   "deepseek/deepseek-v4-pro",
  "gemini-3.1-pro":    "google/gemini-3.1-pro-preview",
  "kimi-k2.7-code":    "moonshotai/kimi-k2.7-code",
  "qwen3.7-plus":      "qwen/qwen3.7-plus",
  "deepseek-v4-flash": "deepseek/deepseek-v4-flash",
  "glm-4.7":           "z-ai/glm-4.7",
  "minimax-m3":        "minimax/minimax-m3",
};

let _mimoJwt = null, _mimoExp = 0;
function mimoFingerprint() {
  // 1) reuse mimocode CLI's fingerprint (mac/linux and Windows locations)
  const cliPaths = [
    pathMod.join(os.homedir(), ".local", "share", "mimocode", "mimo-free-client"),
    pathMod.join(process.env.LOCALAPPDATA || pathMod.join(os.homedir(), "AppData", "Local"), "mimocode", "mimo-free-client"),
  ];
  for (const p of cliPaths) { try { const v = fs.readFileSync(p, "utf8").trim(); if (v) return v; } catch {} }
  // 2) our own cached fingerprint next to this proxy
  const own = pathMod.join(__dirname, "mimo-free-client");
  try { const v = fs.readFileSync(own, "utf8").trim(); if (v) return v; } catch {}
  // 3) generate one the same way mimocode does: sha256(host|platform|arch|cpu|user)
  const cpu = (os.cpus()[0] || {}).model || "unknown-cpu";
  let user = "unknown-user"; try { user = os.userInfo().username; } catch {}
  const seed = [os.hostname(), process.platform, process.arch, cpu, user].join("|");
  const fp = crypto.createHash("sha256").update(seed).digest("hex");
  try { fs.writeFileSync(own, fp); } catch {}
  return fp;
}
function jwtExpMs(jwt) {
  try { return (JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString()).exp || 0) * 1000; } catch { return 0; }
}
function mimoBootstrap() {
  return new Promise((resolve, reject) => {
    const fp = mimoFingerprint();
    if (!fp) return reject(new Error("could not derive mimo fingerprint"));
    const body = Buffer.from(JSON.stringify({ client: fp }));
    const r = https.request({ host: MIMO_HOST, port: 443, method: "POST", path: MIMO_BOOTSTRAP_PATH,
      headers: { "content-type": "application/json", "content-length": body.length } }, (resp) => {
      let b = ""; resp.on("data", (c) => (b += c));
      resp.on("end", () => { try { const j = JSON.parse(b); j.jwt ? resolve(j.jwt) : reject(new Error("bootstrap: no jwt :: " + b.slice(0, 120))); } catch (e) { reject(e); } });
    });
    r.setTimeout(20000, () => r.destroy(new Error("mimo bootstrap timeout")));
    r.on("error", reject); r.write(body); r.end();
  });
}
async function mimoJwt() {
  if (_mimoJwt && _mimoExp - Date.now() > 300000) return _mimoJwt;
  _mimoJwt = await mimoBootstrap();
  _mimoExp = jwtExpMs(_mimoJwt) || (Date.now() + 600000);
  return _mimoJwt;
}

// A ":think" suffix keeps reasoning ON for that request (deeper, slower). Without it, reasoning is disabled.
function parseModel(m) {
  m = m || "";
  const think = m.endsWith(":think");
  const base = think ? m.slice(0, -6) : m;
  // Neutral public alias for subscription models, e.g. pro/deepseek-v4-pro -> real model id.
  if (base.startsWith("pro/")) { const s = base.slice(4); return { model: ZENMUX_WEB[s] || s, think, backend: "zenmuxweb" }; }
  // zenmux*/ prefixes win over the generic vendor/model rule below. Strip -> real ZenMux model id.
  if (base.startsWith("zenmuxweb/")) return { model: base.slice(10), think, backend: "zenmuxweb" };
  if (base.startsWith("zenmux/")) return { model: base.slice(7), think, backend: "zenmux" };
  if (base === "mimo-auto" || base === "mimo/mimo-auto") return { model: "mimo-auto", think, backend: "mimo" };
  if (base.startsWith("gemini")) return { model: base, think, backend: "gemini" };
  if (base.includes("/")) return { model: base, think, backend: "openrouter" };
  return { model: ALLOWED.has(base) ? base : DEFAULT_MODEL, think, backend: "zen" };
}
function routeFor(backend) {
  if (backend === "openrouter") return { host: "openrouter.ai", path: "/api/v1/chat/completions", backend };
  if (backend === "mimo") return { host: MIMO_HOST, path: MIMO_CHAT_PATH, backend };
  if (backend === "gemini") return { host: "generativelanguage.googleapis.com", path: "/v1beta/openai/chat/completions", backend };
  return { host: ZEN_HOST, path: ZEN_PATH, backend };
}

function stripThink(t) {
  if (!t) return t;
  return t.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/<think>[\s\S]*$/g, "").trim();
}
function readBody(req) {
  return new Promise((resolve) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => resolve(Buffer.concat(c))); });
}

const LANG_RULE = "Always reply in the SAME language as the user's most recent message: " +
  "English in -> English out, Vietnamese in -> Vietnamese out. Never switch language on your own.";

// The Xiaomi free endpoint gates access on the system prompt: it returns 403 "Illegal access"
// unless the system message contains this exact sentence (their CLI's opening line). We inject
// it for the mimo backend so mimo-auto works from any client, not just the mimocode CLI.
const MIMO_MARKER = "You are MiMoCode, an interactive CLI tool that helps users with software engineering tasks.";

function toOpenAI(a) {
  const msgs = [];
  if (a.system) {
    const sys = typeof a.system === "string" ? a.system
      : Array.isArray(a.system) ? a.system.map((b) => b.text || "").join("\n") : "";
    if (sys) msgs.push({ role: "system", content: sys });
  }
  if (msgs.length && msgs[0].role === "system") msgs[0].content += "\n\n" + LANG_RULE;
  else msgs.unshift({ role: "system", content: LANG_RULE });
  for (const m of a.messages || []) {
    if (typeof m.content === "string") { msgs.push({ role: m.role, content: m.content }); continue; }
    if (!Array.isArray(m.content)) { msgs.push({ role: m.role, content: "" }); continue; }
    if (m.role === "user") {
      const texts = [], toolResults = [];
      for (const b of m.content) {
        if (b.type === "text") texts.push(b.text);
        else if (b.type === "tool_result") {
          const c = typeof b.content === "string" ? b.content
            : Array.isArray(b.content) ? b.content.map((x) => (x.type === "text" ? x.text : JSON.stringify(x))).join("\n")
            : JSON.stringify(b.content || "");
          toolResults.push({ tool_call_id: b.tool_use_id, content: c });
        }
      }
      for (const tr of toolResults) msgs.push({ role: "tool", tool_call_id: tr.tool_call_id, content: tr.content });
      if (texts.length) msgs.push({ role: "user", content: texts.join("\n") });
      if (!texts.length && !toolResults.length) msgs.push({ role: "user", content: "" });
    } else {
      const texts = [], toolCalls = [];
      for (const b of m.content) {
        if (b.type === "text") texts.push(b.text);
        else if (b.type === "tool_use")
          toolCalls.push({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input || {}) } });
      }
      const msg = { role: "assistant", content: texts.join("\n") || null };
      if (toolCalls.length) msg.tool_calls = toolCalls;
      msgs.push(msg);
    }
  }
  const { model, think, backend } = parseModel(a.model);
  if (backend === "mimo" && msgs[0] && msgs[0].role === "system" && !msgs[0].content.includes(MIMO_MARKER)) {
    msgs[0].content = MIMO_MARKER + "\n\n" + msgs[0].content;
  }
  const out = { model, messages: msgs, max_tokens: a.max_tokens || 4096, stream: false };
  if (backend === "zen" && !think) out.thinking = { type: "disabled" };
  if (a.temperature != null) out.temperature = a.temperature;
  if (Array.isArray(a.tools) && a.tools.length) {
    out.tools = a.tools.filter((t) => t && t.name)
      .map((t) => ({ type: "function", function: { name: t.name, description: t.description || "", parameters: t.input_schema || { type: "object", properties: {} } } }));
  }
  if (a.tool_choice) {
    if (a.tool_choice.type === "auto") out.tool_choice = "auto";
    else if (a.tool_choice.type === "any") out.tool_choice = "required";
    else if (a.tool_choice.type === "tool") out.tool_choice = { type: "function", function: { name: a.tool_choice.name } };
  }
  return out;
}
function mapStop(fr) { return fr === "tool_calls" ? "tool_use" : fr === "length" ? "max_tokens" : "end_turn"; }
function toAnthropic(o) {
  const choice = (o.choices && o.choices[0]) || {};
  const content = [];
  const msg = choice.message || {};
  const text = stripThink(msg.content) || ((msg.tool_calls && msg.tool_calls.length) ? "" : (msg.reasoning_content || msg.reasoning || ""));
  if (text) content.push({ type: "text", text });
  for (const tc of msg.tool_calls || []) {
    let input = {};
    try { input = JSON.parse(tc.function.arguments || "{}"); } catch {}
    content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
  }
  return { id: o.id || "msg_" + Date.now(), type: "message", role: "assistant", model: o.model || MODEL,
    content, stop_reason: mapStop(choice.finish_reason), stop_sequence: null,
    usage: { input_tokens: (o.usage && o.usage.prompt_tokens) || 0, output_tokens: (o.usage && o.usage.completion_tokens) || 0 } };
}
function ev(res, type, obj) { res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...obj })}\n\n`); }

function streamTranslate(res, upstream, msgId, model, inputTokens) {
  let started = false, textOpen = false, blockIndex = -1;
  const toolIdx = {};
  let inThink = false, anyText = false, reasoningBuf = "", stop = "end_turn", outChars = 0, buf = "";
  let realIn = 0, realOut = 0;
  const start = () => { if (started) return; started = true;
    ev(res, "message_start", { message: { id: msgId, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } }); };
  const openText = () => { start(); if (!textOpen) { blockIndex++; textOpen = true; ev(res, "content_block_start", { index: blockIndex, content_block: { type: "text", text: "" } }); } };
  const closeText = () => { if (textOpen) { ev(res, "content_block_stop", { index: blockIndex }); textOpen = false; } };
  const emitText = (t) => {
    if (!t) return;
    let out = "", i = 0;
    while (i < t.length) {
      if (!inThink) { const o = t.indexOf("<think>", i); if (o === -1) { out += t.slice(i); break; } out += t.slice(i, o); i = o + 7; inThink = true; }
      else { const c = t.indexOf("</think>", i); if (c === -1) { i = t.length; } else { i = c + 8; inThink = false; } }
    }
    if (out) { openText(); anyText = true; outChars += out.length; ev(res, "content_block_delta", { index: blockIndex, delta: { type: "text_delta", text: out } }); }
  };
  const onToolCall = (tc) => {
    start();
    const k = tc.index != null ? tc.index : 0;
    if (toolIdx[k] === undefined) { closeText(); blockIndex++; toolIdx[k] = blockIndex;
      ev(res, "content_block_start", { index: blockIndex, content_block: { type: "tool_use", id: tc.id || ("call_" + k), name: (tc.function && tc.function.name) || "", input: {} } }); }
    const args = tc.function && tc.function.arguments;
    if (args) { outChars += args.length; ev(res, "content_block_delta", { index: toolIdx[k], delta: { type: "input_json_delta", partial_json: args } }); }
  };
  upstream.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let j; try { j = JSON.parse(data); } catch { continue; }
      if (j.usage) { if (j.usage.prompt_tokens) realIn = j.usage.prompt_tokens; if (j.usage.completion_tokens) realOut = j.usage.completion_tokens; }
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
    for (const k in toolIdx) ev(res, "content_block_stop", { index: toolIdx[k] });
    const outTok = realOut || Math.ceil(outChars / 4);
    ev(res, "message_delta", { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: outTok } });
    ev(res, "message_stop", {});
    res.end();
  });
  upstream.on("error", () => { try { start(); ev(res, "message_stop", {}); res.end(); } catch {} });
}

// ZenMux web-session cookie (subscription auth). Read fresh per request so re-pasting the cookie
// in keys.json takes effect without restarting the proxy. Env var wins over the file.
function loadCookie() {
  if (process.env.ZENMUX_COOKIE) return process.env.ZENMUX_COOKIE;
  try { return JSON.parse(fs.readFileSync(pathMod.join(__dirname, "keys.json"), "utf8")).zenmux_cookie || ""; }
  catch { return ""; }
}

// ZenMux *subscription* passthrough via the web session. Same native Anthropic passthrough as the
// API-key path, but authenticates with the logged-in browser cookie + the headers the web app sends
// (origin/referer/UA + x-zenmux-apikey-source: subscription). Cookies are short-lived — when they
// expire ZenMux returns 401/403 and you re-copy the cookie into keys.json (zenmux_cookie).
// Rewrite upstream error bodies into friendly, provider-neutral messages.
// Strips the gateway name / docs URL and gives an actionable hint per status code.
function friendlyError(status, rawBody) {
  let upstream = "";
  try { const j = JSON.parse(rawBody); upstream = (j && j.error && j.error.message) || ""; } catch {}
  let type = "api_error", message;
  if (status === 402) {
    type = "rate_limit_error";
    message = "⚠️  Subscription quota reached for this model. It refreshes on a rolling window — wait a bit, or pick another model from the launcher (Ctrl-C and run claude-free again).";
  } else if (status === 401 || status === 403) {
    type = "authentication_error";
    message = "🔑  Session expired. Refresh your subscription cookie (re-copy it from the browser into keys.json), then relaunch.";
  } else if (status === 429) {
    type = "rate_limit_error";
    message = "🐢  Rate limited — too many requests right now. Wait a few seconds and try again, or switch to a different model.";
  } else if (status === 404) {
    type = "not_found_error";
    message = "🚫  This model isn't available on your plan. Pick another one from the launcher.";
  } else if (status >= 500) {
    type = "api_error";
    message = "🛠️  The model is temporarily unavailable upstream. Try again in a moment or switch models.";
  } else {
    message = "Request failed (HTTP " + status + ")." + (upstream ? " " + upstream.replace(/https?:\/\/\S+/g, "").trim() : "");
  }
  return JSON.stringify({ type: "error", error: { type, message } });
}

// Write an error response ONLY if streaming hasn't already begun. Once headers are sent
// (e.g. an SSE stream is mid-flight), writeHead throws ERR_HTTP_HEADERS_SENT — which, in a
// bare upstream "error" handler, is an uncaught exception that crashes the whole proxy.
function safeError(res, status, message) {
  if (res.headersSent || res.writableEnded) { try { res.end(); } catch {} return; }
  try {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ type: "error", error: { type: "api_error", message } }));
  } catch {}
}

// Pipe a successful upstream response straight through, but buffer error responses (>=400)
// so we can replace the raw provider message with a friendly one.
function pipeOrRewrite(ures, res) {
  const h = { "content-type": ures.headers["content-type"] || "application/json" };
  if (ures.headers["cache-control"]) h["cache-control"] = ures.headers["cache-control"];
  const status = ures.statusCode || 200;
  // A mid-stream upstream socket error must not throw past the pipe — just end the client stream.
  if (status < 400) { res.writeHead(status, h); ures.on("error", () => { try { res.end(); } catch {} }); ures.pipe(res); return; }
  let body = "";
  ures.on("data", (c) => { body += c.toString("utf8"); });
  ures.on("end", () => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(friendlyError(status, body));
  });
}

function zenmuxWebPassthrough(req, res, areq, realModel) {
  const cookie = loadCookie();
  if (!cookie) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ type: "error", error: { type: "authentication_error",
      message: "no ZenMux session cookie — set ZENMUX_COOKIE or add \"zenmux_cookie\" to keys.json" } }));
    return;
  }
  areq.model = realModel;
  const payload = Buffer.from(JSON.stringify(areq), "utf8");
  const headers = {
    "content-type": "application/json",
    "content-length": payload.length,
    "anthropic-version": req.headers["anthropic-version"] || "2023-06-01",
    cookie,
    origin: "https://zenmux.ai",
    referer: "https://zenmux.ai/platform/chat",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    "x-zenmux-accept-processing": "true, true",
    // Free ZenMux models bill $0 on pay-as-you-go and have no subscription quota, so route them
    // through "payg" (the web chat does the same). Paid models use the logged-in subscription.
    "x-zenmux-apikey-source": realModel.endsWith("-free") ? "payg" : "subscription",
  };
  const ureq = https.request({ host: "zenmux.ai", port: 443, method: "POST", path: "/api/anthropic/v1/messages", headers }, (ures) => {
    pipeOrRewrite(ures, res);
  });
  ureq.setTimeout(120000, () => ureq.destroy(new Error("upstream timeout after 120s")));
  ureq.on("error", (e) => safeError(res, 502, "🛠️  Couldn't reach the model: " + e.message));
  ureq.write(payload); ureq.end();
}

// ZenMux passthrough: it implements the Anthropic Messages API directly, so we forward the original
// Anthropic request verbatim (only swapping the model id to drop the "zenmux/" prefix) and pipe the
// native response — JSON or SSE — straight back. No toOpenAI/toAnthropic translation, so streaming,
// tool calls, thinking, and the 1M context window all work natively.
function zenmuxPassthrough(req, res, areq, realModel) {
  areq.model = realModel;
  const payload = Buffer.from(JSON.stringify(areq), "utf8");
  const headers = {
    "content-type": "application/json",
    "content-length": payload.length,
    authorization: req.headers.authorization || "Bearer ",
    "anthropic-version": req.headers["anthropic-version"] || "2023-06-01",
  };
  const ureq = https.request({ host: "zenmux.ai", port: 443, method: "POST", path: "/api/anthropic/v1/messages", headers }, (ures) => {
    pipeOrRewrite(ures, res);
  });
  ureq.setTimeout(120000, () => ureq.destroy(new Error("upstream timeout after 120s")));
  ureq.on("error", (e) => safeError(res, 502, "🛠️  Couldn't reach the model: " + e.message));
  ureq.write(payload); ureq.end();
}

function callBackend(route, authHeader, oaBody, onResponse, onError) {
  const payload = Buffer.from(JSON.stringify(oaBody), "utf8");
  const headers = { "content-type": "application/json", authorization: authHeader, "content-length": payload.length };
  if (route.backend === "mimo") headers["x-mimo-source"] = "mimocode-cli-free";
  const req = https.request({ host: route.host, port: 443, method: "POST", path: route.path, headers }, onResponse);
  req.setTimeout(120000, () => req.destroy(new Error("upstream timeout after 120s")));
  req.on("error", onError);
  req.write(payload); req.end();
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url.includes("/v1/messages/count_tokens")) {
    const body = await readBody(req);
    let n = 0;
    try { n = Math.ceil(JSON.stringify(JSON.parse(body.toString()).messages || "").length / 4); } catch {}
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ input_tokens: n }));
    return;
  }
  if (req.method !== "POST" || !req.url.includes("/v1/messages")) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ type: "error", error: { type: "not_found", message: "use POST /v1/messages" } }));
    return;
  }
  const raw = await readBody(req);
  let areq;
  try { areq = JSON.parse(raw.toString("utf8")); } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "bad json" } }));
    return;
  }
  const parsed = parseModel(areq.model);
  if (parsed.backend === "zenmuxweb") { zenmuxWebPassthrough(req, res, areq, parsed.model); return; }
  if (parsed.backend === "zenmux") { zenmuxPassthrough(req, res, areq, parsed.model); return; }
  const oaBody = toOpenAI(areq);
  oaBody.stream = !!areq.stream;
  if (oaBody.stream) oaBody.stream_options = { include_usage: true };
  const route = routeFor(parsed.backend);
  const msgId = "msg_" + Date.now();
  const inEst = Math.ceil(JSON.stringify(areq.messages || "").length / 4);

  let authHeader = "Bearer ";
  if (parsed.backend === "openrouter" || parsed.backend === "gemini") authHeader = req.headers.authorization || "Bearer ";
  else if (parsed.backend === "mimo") {
    try { authHeader = "Bearer " + (await mimoJwt()); }
    catch (e) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "mimo bootstrap failed: " + e.message } }));
      return;
    }
  }

  callBackend(route, authHeader, oaBody, (ures) => {
    if (ures.statusCode >= 400) {
      let b = "";
      ures.on("data", (c) => (b += c));
      ures.on("end", () => {
        let o; try { o = JSON.parse(b); } catch { o = { message: b.slice(0, 300) }; }
        res.writeHead(ures.statusCode, { "content-type": "application/json" });
        res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: JSON.stringify(o) } }));
      });
      return;
    }
    if (areq.stream) {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      streamTranslate(res, ures, msgId, parsed.model, inEst);
    } else {
      let b = "";
      ures.on("data", (c) => (b += c));
      ures.on("end", () => {
        let o;
        try { o = JSON.parse(b); } catch (e) {
          res.writeHead(502, { "content-type": "application/json" });
          res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "parse: " + e.message + " :: " + b.slice(0, 200) } }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(toAnthropic(o)));
      });
    }
  }, (e) => safeError(res, 502, e.message));
});

// Content hash of this proxy's own source, so claude-free can detect when the running
// proxy is stale (source on disk changed) and auto-restart it.
function selfHash() {
  try { return crypto.createHash("sha256").update(fs.readFileSync(__filename)).digest("hex").slice(0, 16); }
  catch { return ""; }
}

server.listen(PORT, "127.0.0.1", () => {
  const actual = server.address().port;
  try { fs.writeFileSync(STATE_FILE, JSON.stringify({ port: actual, pid: process.pid, srcHash: selfHash() })); } catch {}
  console.log(`claude-proxy on http://127.0.0.1:${actual} (free models)`);
});
// Last-resort backstop: a stray async error (e.g. an upstream socket dying mid-stream) must never
// take the whole proxy down and strand every other model. Log and keep serving.
process.on("uncaughtException", (e) => { try { console.error("uncaught:", e && e.message); } catch {} });
process.on("unhandledRejection", (e) => { try { console.error("unhandled:", e && (e.message || e)); } catch {} });

// Clean up the state file on a graceful stop (SIGTERM from `claude-free --stop`, Ctrl-C, normal exit).
const cleanup = () => { try { fs.unlinkSync(STATE_FILE); } catch {} };
process.on("exit", cleanup);
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { cleanup(); process.exit(0); });
