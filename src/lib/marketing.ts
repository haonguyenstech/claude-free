// Static content shared by the public landing page and docs. Kept in one place so the two pages
// can't drift. The install commands mirror README.md; the model list mirrors the picker in
// claude-free.js (OpenCode + ClinePass tiers). Update here when either changes.

export const REPO_URL = "https://github.com/haonguyenstech/claude-free"
export const RAW_BASE = "https://raw.githubusercontent.com/haonguyenstech/claude-free/main"

export const INSTALL = {
  unix: {
    label: "macOS · Linux · WSL · Git Bash",
    cmd: `curl -fsSL ${RAW_BASE}/install.sh | bash`,
  },
  cmd: {
    label: "Windows · Command Prompt",
    cmd: `curl -fsSLo "%TEMP%\\cf-install.bat" ${RAW_BASE}/install.bat && "%TEMP%\\cf-install.bat"`,
  },
  powershell: {
    label: "Windows · PowerShell",
    cmd: `irm ${RAW_BASE}/install.ps1 | iex`,
  },
} as const

export type Tier = "opencode" | "clinepass"

export type MarketingModel = { name: string; id: string; tps?: number; ctx?: string; note: string; star?: boolean }

// Mirrors the MODELS array in claude-free.js.
export const MODELS: Record<Tier, MarketingModel[]> = {
  opencode: [
    { name: "North Mini Code", id: "north-mini-code-free", tps: 123, note: "fast coding model", star: true },
    { name: "DeepSeek V4 Flash", id: "deepseek-v4-flash-free", tps: 63, note: "fast, clean · small model" },
    { name: "Big Pickle", id: "big-pickle", tps: 53, note: "stealth, fast & clean" },
    { name: "MiMo V2.5", id: "mimo-v2.5-free", tps: 42, note: "reasoning (shows thinking)" },
    { name: "Nemotron 3 Ultra", id: "nemotron-3-ultra-free", tps: 17, note: "550B, deepest · slow" },
  ],
  clinepass: [
    { name: "GLM-5.2", id: "cline-pass/glm-5.2", note: "general coding" },
    { name: "Kimi K2.7 Code", id: "cline-pass/kimi-k2.7-code", ctx: "1M", note: "large context" },
    { name: "Kimi K2.6", id: "cline-pass/kimi-k2.6", ctx: "1M", note: "large context" },
    { name: "DeepSeek V4 Pro", id: "cline-pass/deepseek-v4-pro", note: "deep reasoning" },
    { name: "DeepSeek V4 Flash", id: "cline-pass/deepseek-v4-flash", note: "fast" },
    { name: "MiMo-V2.5", id: "cline-pass/mimo-v2.5", note: "reasoning" },
    { name: "MiMo-V2.5-Pro", id: "cline-pass/mimo-v2.5-pro", note: "reasoning · pro" },
    { name: "MiniMax M3", id: "cline-pass/minimax-m3", note: "general" },
    { name: "Qwen3.7 Max", id: "cline-pass/qwen3.7-max", note: "largest Qwen" },
    { name: "Qwen3.7 Plus", id: "cline-pass/qwen3.7-plus", note: "balanced Qwen" },
  ],
}

export const TIERS = {
  opencode: {
    name: "OpenCode",
    price: "Free models",
    priceNote: "ready to use",
    blurb: "Works instantly. Run claude-free, pick a model, and go. Backed by opencode.ai Zen.",
  },
  clinepass: {
    name: "ClinePass",
    price: "More models",
    priceNote: "when enabled",
    blurb: "A wider model roster for teams that already have ClinePass access enabled.",
  },
} as const
