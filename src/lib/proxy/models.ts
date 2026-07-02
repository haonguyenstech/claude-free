// Model catalogs, backend hosts, and dashboard display metadata.
// Lifted verbatim from claude-proxy.js (lines 24-66, 149-155, 863-888) — the source of truth
// for which models route where and how they appear in the dashboard.

export const ZEN_HOST = "opencode.ai";
export const ZEN_PATH = "/zen/v1/chat/completions";
export const TOKENROUTER_HOST = "api.tokenrouter.com";
export const TOKENROUTER_PATH = "/v1/chat/completions";

export const CLINEPASS_HOST = "api.cline.bot";
export const CLINEPASS_PATH = "/api/v1/chat/completions";

export const DEFAULT_MODEL = process.env.ZEN_MODEL || "deepseek-v4-flash-free";
export const ALLOWED = new Set([
  "deepseek-v4-flash-free",
  "north-mini-code-free",
  "nemotron-3-ultra-free",
  "mimo-v2.5-free",
  "big-pickle",
]);
export const MODEL = DEFAULT_MODEL;

// ClinePass subscription models (api.cline.bot). Full slug is the model id used upstream.
export const CLINEPASS_MODELS = [
  "cline-pass/glm-5.2",
  "cline-pass/kimi-k2.7-code",
  "cline-pass/kimi-k2.6",
  "cline-pass/deepseek-v4-pro",
  "cline-pass/deepseek-v4-flash",
  "cline-pass/mimo-v2.5",
  "cline-pass/mimo-v2.5-pro",
  "cline-pass/minimax-m3",
  "cline-pass/qwen3.7-max",
  "cline-pass/qwen3.7-plus",
];

// Default output cap when a client omits `max_tokens`. Claude Code always sends its own, so this only
// affects raw/3rd-party clients that leave it unset — kept generous to avoid silent truncation, and
// overridable via env for operators whose upstream rejects large values.
export const DEFAULT_MAX_TOKENS = Number(process.env.CLAUDE_FREE_MAX_TOKENS) || 8192;

// Public alias -> exact model id for TokenRouter (case-sensitive upstream names).
export const TOKENROUTER_MODELS: Record<string, string> = {
  // Client id stays `tokenrouter/gpt-5.6-mercury`; TokenRouter's actual model name includes the
  // `tokenrouter/` prefix (verified: the bare name 404s, the prefixed name reaches the channel).
  "gpt-5.6-mercury": "tokenrouter/gpt-5.6-mercury",
};

// Gemini models served via the Gemini key (Google AI Studio). The id passes through verbatim.
export const GEMINI_MODELS = ["gemini-2.5-flash-lite"];

// Real Claude models, served via the local `claude` CLI (host's Claude Code login). If an Anthropic
// API key is configured they go through api.anthropic.com instead; otherwise they fall back to the CLI.
export const ANTHROPIC_MODELS = ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"];

// Models served through a local `claude` CLI process (Claude Code subscription token).
export const CLI_MODELS = [
  "claude-opus-4-8",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
];

// Curated free, tool-calling models on OpenRouter (free of charge, but need the server's key).
export const OPENROUTER_FREE_MODELS = [
  "openai/gpt-oss-120b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-4-31b-it:free",
  "openai/gpt-oss-20b:free",
  "nvidia/nemotron-nano-12b-v2-vl:free",
];

// ---- Sakana AI "Namazu" backend (chat.sakana.ai — a HuggingFace chat-ui instance) ----
// No API key: auth is the browser's sakana-chat + cf_clearance cookies (serverKey("sakana")).
// Client model id is `sakana/namazu`; it routes to backend "sakana" (see translate.ts:parseModel).
export const SAKANA_HOST = "chat.sakana.ai";
export const SAKANA_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0";
export const SAKANA_MODELS = ["namazu"];

// ---- MiMo free backend (Xiaomi) ----
export const MIMO_HOST = "api.xiaomimimo.com";
export const MIMO_CHAT_PATH = "/api/free-ai/openai/chat";
export const MIMO_BOOTSTRAP_PATH = "/api/free-ai/bootstrap";

export const LANG_RULE =
  "Always reply in the same language the user wrote their most recent message in. " +
  "Never switch languages on your own.";

// The Xiaomi free endpoint gates access on the system prompt: it returns 403 "Illegal access"
// unless the system message contains this exact sentence (their CLI's opening line).
export const MIMO_MARKER =
  "You are MiMoCode, an interactive CLI tool that helps users with software engineering tasks.";

// Backend credential fields the dashboard can edit. envVar = env var that OVERRIDES keys.json.
// Only ClinePass is surfaced — OpenCode is keyless, and the other backends are hidden from the UI.
export const BACKEND_KEYS = [
  { id: "clinepass", label: "ClinePass key", envVar: "CLINEPASS_KEY", hint: "powers cline-pass/* models", link: "https://app.cline.bot", linkLabel: "get key ↗" },
];

// Display metadata for the dashboard model list (name/context/throughput), keyed by bare alias.
export const MODEL_META: Record<string, { name: string; ctx: string; tps: number }> = {
  "big-pickle": { name: "Big Pickle", ctx: "", tps: 53 },
  "mimo-auto": { name: "MiMo Auto", ctx: "1M", tps: 71 },
  "deepseek-v4-flash-free": { name: "DeepSeek V4 Flash", ctx: "", tps: 63 },
  "north-mini-code-free": { name: "North Mini Code", ctx: "", tps: 123 },
  "mimo-v2.5-free": { name: "MiMo V2.5", ctx: "", tps: 42 },
  "nemotron-3-ultra-free": { name: "Nemotron 3 Ultra", ctx: "", tps: 17 },
  "gpt-5.6-mercury": { name: "GPT-5.6 Mercury", ctx: "", tps: 0 },
  "sakana/namazu": { name: "Namazu (Sakana AI)", ctx: "", tps: 0 },
  "gemini-2.5-flash-lite": { name: "Gemini 2.5 Flash-Lite", ctx: "1M", tps: 91 },
  "claude-opus-4-8": { name: "Claude Opus 4.8", ctx: "200K", tps: 35 },
  "claude-sonnet-4-6": { name: "Claude Sonnet 4.6", ctx: "200K", tps: 32 },
  "claude-haiku-4-5-20251001": { name: "Claude Haiku 4.5", ctx: "200K", tps: 50 },
  "openai/gpt-oss-120b:free": { name: "gpt-oss 120B", ctx: "131K", tps: 31 },
  "nvidia/nemotron-3-super-120b-a12b:free": { name: "Nemotron 3 Super 120B", ctx: "1M", tps: 32 },
  "google/gemma-4-31b-it:free": { name: "Gemma 4 31B", ctx: "262K", tps: 40 },
  "openai/gpt-oss-20b:free": { name: "gpt-oss 20B", ctx: "131K", tps: 33 },
  "nvidia/nemotron-nano-12b-v2-vl:free": { name: "Nemotron Nano 12B", ctx: "128K", tps: 43 },
  "cline-pass/glm-5.2": { name: "GLM-5.2", ctx: "", tps: 0 },
  "cline-pass/kimi-k2.7-code": { name: "Kimi K2.7 Code", ctx: "1M", tps: 0 },
  "cline-pass/kimi-k2.6": { name: "Kimi K2.6", ctx: "1M", tps: 0 },
  "cline-pass/deepseek-v4-pro": { name: "DeepSeek V4 Pro", ctx: "", tps: 0 },
  "cline-pass/deepseek-v4-flash": { name: "DeepSeek V4 Flash", ctx: "", tps: 0 },
  "cline-pass/mimo-v2.5": { name: "MiMo-V2.5", ctx: "", tps: 0 },
  "cline-pass/mimo-v2.5-pro": { name: "MiMo-V2.5-Pro", ctx: "", tps: 0 },
  "cline-pass/minimax-m3": { name: "MiniMax M3", ctx: "", tps: 0 },
  "cline-pass/qwen3.7-max": { name: "Qwen3.7 Max", ctx: "", tps: 0 },
  "cline-pass/qwen3.7-plus": { name: "Qwen3.7 Plus", ctx: "", tps: 0 },
};
