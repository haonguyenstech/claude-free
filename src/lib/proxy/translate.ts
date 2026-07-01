// Pure request/response translation: Anthropic Messages API <-> OpenAI chat-completions.
// Lifted verbatim from claude-proxy.js (lines 119-230, 294-317). No req/res — just data in/out.
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  ALLOWED,
  DEFAULT_MODEL,
  DEFAULT_MAX_TOKENS,
  MODEL,
  TOKENROUTER_MODELS,
  ZEN_HOST,
  ZEN_PATH,
  TOKENROUTER_HOST,
  TOKENROUTER_PATH,
  MIMO_HOST,
  MIMO_CHAT_PATH,
  LANG_RULE,
  MIMO_MARKER,
} from "./models";

export type Backend = "anthropic" | "gemini" | "cli" | "openrouter" | "zen" | "mimo" | "tokenrouter" | "sakana";
export interface Parsed {
  model: string;
  think: boolean;
  backend: Backend;
}

// A ":think" suffix keeps reasoning ON for that request. Without it, reasoning is disabled.
export function parseModel(m: string | undefined): Parsed {
  m = m || "";
  const think = m.endsWith(":think");
  const base = think ? m.slice(0, -6) : m;
  if (base.startsWith("tokenrouter/")) {
    const s = base.slice(12);
    return { model: TOKENROUTER_MODELS[s] || s, think, backend: "tokenrouter" };
  }
  if (base === "mimo-auto" || base === "mimo/mimo-auto") return { model: "mimo-auto", think, backend: "mimo" };
  if (base === "sakana/namazu" || base === "sakana" || base === "namazu") return { model: "namazu", think, backend: "sakana" };
  if (base.startsWith("claude")) return { model: base, think, backend: "anthropic" };
  if (base.startsWith("gemini")) return { model: base, think, backend: "gemini" };
  if (base.startsWith("cli/")) return { model: base.slice(4), think, backend: "cli" };
  if (base.includes("/")) return { model: base, think, backend: "openrouter" };
  return { model: ALLOWED.has(base) ? base : DEFAULT_MODEL, think, backend: "zen" };
}

export function routeFor(backend: Backend): { host: string; path: string; backend: Backend } {
  if (backend === "anthropic") return { host: "api.anthropic.com", path: "/v1/messages", backend };
  if (backend === "tokenrouter") return { host: TOKENROUTER_HOST, path: TOKENROUTER_PATH, backend };
  if (backend === "openrouter") return { host: "openrouter.ai", path: "/api/v1/chat/completions", backend };
  if (backend === "mimo") return { host: MIMO_HOST, path: MIMO_CHAT_PATH, backend };
  if (backend === "gemini") return { host: "generativelanguage.googleapis.com", path: "/v1beta/openai/chat/completions", backend };
  return { host: ZEN_HOST, path: ZEN_PATH, backend };
}

export function stripThink(t: any): any {
  if (!t) return t;
  return t.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/<think>[\s\S]*$/g, "").trim();
}

export function toOpenAI(a: any): any {
  const msgs: any[] = [];
  if (a.system) {
    const sys =
      typeof a.system === "string"
        ? a.system
        : Array.isArray(a.system)
          ? a.system.map((b: any) => b.text || "").join("\n")
          : "";
    if (sys) msgs.push({ role: "system", content: sys });
  }
  if (msgs.length && msgs[0].role === "system") msgs[0].content += "\n\n" + LANG_RULE;
  else msgs.unshift({ role: "system", content: LANG_RULE });
  for (const m of a.messages || []) {
    if (typeof m.content === "string") {
      msgs.push({ role: m.role, content: m.content });
      continue;
    }
    if (!Array.isArray(m.content)) {
      msgs.push({ role: m.role, content: "" });
      continue;
    }
    if (m.role === "user") {
      const texts: string[] = [];
      const toolResults: any[] = [];
      for (const b of m.content) {
        if (b.type === "text") texts.push(b.text);
        else if (b.type === "tool_result") {
          const c =
            typeof b.content === "string"
              ? b.content
              : Array.isArray(b.content)
                ? b.content.map((x: any) => (x.type === "text" ? x.text : JSON.stringify(x))).join("\n")
                : JSON.stringify(b.content || "");
          toolResults.push({ tool_call_id: b.tool_use_id, content: c });
        }
      }
      for (const tr of toolResults) msgs.push({ role: "tool", tool_call_id: tr.tool_call_id, content: tr.content });
      if (texts.length) msgs.push({ role: "user", content: texts.join("\n") });
      if (!texts.length && !toolResults.length) msgs.push({ role: "user", content: "" });
    } else {
      const texts: string[] = [];
      const toolCalls: any[] = [];
      for (const b of m.content) {
        if (b.type === "text") texts.push(b.text);
        else if (b.type === "tool_use")
          toolCalls.push({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input || {}) } });
      }
      const msg: any = { role: "assistant", content: texts.join("\n") || null };
      if (toolCalls.length) msg.tool_calls = toolCalls;
      msgs.push(msg);
    }
  }
  const { model, think, backend } = parseModel(a.model);
  if (backend === "mimo" && msgs[0] && msgs[0].role === "system" && !msgs[0].content.includes(MIMO_MARKER)) {
    msgs[0].content = MIMO_MARKER + "\n\n" + msgs[0].content;
  }
  const out: any = { model, messages: msgs, max_tokens: a.max_tokens || DEFAULT_MAX_TOKENS, stream: false };
  if (backend === "zen" && !think) out.thinking = { type: "disabled" };
  // Gemini 2.5 "thinking" silently eats the whole max_tokens budget; disable unless explicitly asked.
  if (backend === "gemini" && !think) out.reasoning_effort = "none";
  if (a.temperature != null) out.temperature = a.temperature;
  if (Array.isArray(a.tools) && a.tools.length) {
    out.tools = a.tools
      .filter((t: any) => t && t.name)
      .map((t: any) => ({
        type: "function",
        function: { name: t.name, description: t.description || "", parameters: t.input_schema || { type: "object", properties: {} } },
      }));
  }
  if (a.tool_choice) {
    if (a.tool_choice.type === "auto") out.tool_choice = "auto";
    else if (a.tool_choice.type === "any") out.tool_choice = "required";
    else if (a.tool_choice.type === "tool") out.tool_choice = { type: "function", function: { name: a.tool_choice.name } };
  }
  return out;
}

export function mapStop(fr: string | undefined): string {
  return fr === "tool_calls" ? "tool_use" : fr === "length" ? "max_tokens" : "end_turn";
}

export function toAnthropic(o: any): any {
  const choice = (o.choices && o.choices[0]) || {};
  const content: any[] = [];
  const msg = choice.message || {};
  const text =
    stripThink(msg.content) ||
    (msg.tool_calls && msg.tool_calls.length ? "" : msg.reasoning_content || msg.reasoning || "");
  if (text) content.push({ type: "text", text });
  for (const tc of msg.tool_calls || []) {
    let input = {};
    try {
      input = JSON.parse(tc.function.arguments || "{}");
    } catch {}
    content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
  }
  return {
    id: o.id || "msg_" + Date.now(),
    type: "message",
    role: "assistant",
    model: o.model || MODEL,
    content,
    stop_reason: mapStop(choice.finish_reason),
    stop_sequence: null,
    usage: { input_tokens: (o.usage && o.usage.prompt_tokens) || 0, output_tokens: (o.usage && o.usage.completion_tokens) || 0 },
  };
}

// Rewrite upstream error bodies into friendly, provider-neutral messages.
export function friendlyError(status: number, rawBody: string): string {
  let upstream = "";
  try {
    const j = JSON.parse(rawBody);
    upstream = (j && j.error && j.error.message) || "";
  } catch {}
  let type = "api_error";
  let message: string;
  if (status === 402) {
    type = "rate_limit_error";
    message =
      "⚠️  Quota reached for this model. It refreshes on a rolling window — wait a bit, or pick another model from the launcher (Ctrl-C and run claude-free again).";
  } else if (status === 401 || status === 403) {
    type = "authentication_error";
    message = "🔑  Credential expired or invalid. Refresh it in the dashboard (Backend credentials), then relaunch.";
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
