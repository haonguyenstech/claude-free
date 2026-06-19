# claude-free

Run **Claude Code** on free AI models (DeepSeek, MiMo, Nemotron, Gemini, …) through a tiny
local proxy. Cross-platform: **Windows, macOS, Linux**. A Node.js picker lets you choose a
model, reasoning mode, and permission mode, then launches Claude Code pointed at the proxy.

## Install

One command. It installs Node.js and Claude Code if missing, drops the program in
`~/.claude-free` (or `%USERPROFILE%\.claude-free`), and adds a `claude-free` command to your PATH.

### Windows — Command Prompt (cmd.exe, no PowerShell)
```bat
curl -fsSLo "%TEMP%\cf-install.bat" https://raw.githubusercontent.com/haonguyenstech/claude-free/main/install.bat && "%TEMP%\cf-install.bat"
```
> Pure cmd — uses the built-in `curl.exe` (Windows 10 1803+/11). Installs Node.js (via winget) and
> Claude Code if missing, then adds a `claude-free` command to your PATH.

### Windows — PowerShell (alternative)
```powershell
irm https://raw.githubusercontent.com/haonguyenstech/claude-free/main/install.ps1 | iex
```

After installing on Windows, open a **new Command Prompt** and run `claude-free` — it runs in cmd
(no PowerShell needed at runtime either).

### macOS / Linux / WSL / Git Bash
```bash
curl -fsSL https://raw.githubusercontent.com/haonguyenstech/claude-free/main/install.sh | bash
```

Then open a **new terminal** and run:
```
claude-free
```

## How it works
- `claude-proxy.js` — a localhost server (on an auto-picked free port; `claude-free --stop` stops it) that translates Anthropic Messages API ⇄ OpenAI
  chat completions and routes each model to the right free backend:
  - Zen free models → `opencode.ai` (empty bearer, **no key, no account**)
  - `mimo-auto` → Xiaomi free endpoint (self-bootstraps a device fingerprint → JWT, **no key**)
  - `pro/<model>` → ZenMux, authenticated with your **own logged-in browser cookie**. ZenMux speaks
    the Anthropic API natively, so these pass through untouched — full streaming, tools, 1M context.
  - `gemini-*` → Google AI Studio (free key) · `vendor/model:free` → OpenRouter (free key)
- `claude-free.js` — the picker. Auto-starts the proxy, handles auth, launches `claude`.

## Tiers
- **FREE** — works instantly. No account, no key, no cookie. Just run `claude-free` and pick one.
- **FREE PRO** — ZenMux models billed **$0** (pay-as-you-go, no quota), but they need a ZenMux
  session cookie because they run against your logged-in ZenMux account.
- **PRO** — ZenMux subscription models (hidden by default). Same cookie, uses your plan's quota.

## Authentication is per-machine — you never use anyone else's
There is **no shared credential in this repo**, by design:

- **FREE tier** needs nothing — anyone who installs it can use those models immediately.
- **FREE PRO / PRO** need a **ZenMux session cookie that is yours**. The first time you pick a
  cookie-backed model, the picker prompts *"Paste your ZenMux cookie"* and saves it to **your own**
  `~/.claude-free/keys.json` (gitignored, never published). Each PC/user supplies their own — a
  cookie is tied to one ZenMux session and bills that account, not anyone else's.

Get your cookie: log in at <https://zenmux.ai> → DevTools → Network → copy the `cookie:` request
header (the `sessionId` + `sessionId.sig` pair) from any request to `zenmux.ai`. You can also supply
it via the `ZENMUX_COOKIE` environment variable instead of pasting.

Google/OpenRouter key-models read their key from an env var (`GEMINI_API_KEY`, `OPENROUTER_API_KEY`)
or `~/.claude-free/keys.json` — the picker offers to save it the first time.

## Models
| Tier | Models | Backend | Auth |
|---|---|---|---|
| FREE | Big Pickle · DeepSeek V4 Flash · North Mini Code ⭐ · MiMo V2.5 | Zen | none |
| FREE | MiMo Auto (1M ctx) | Xiaomi | none |
| FREE | Nemotron 3 Ultra | Zen | none |
| FREE PRO | Kimi K2.7 Code ⭐ · GLM 4.7 Flash · GLM 5.2 (1M) · Step 3.7 Flash | ZenMux | cookie ($0) |
| PRO | Kimi K2.7 · DeepSeek V4 · Gemini 3.1 Pro · MiniMax M3 · Qwen3.7 · GLM 4.7 | ZenMux | cookie (plan) |

> ⭐ = default pick in its tier. Run `claude-free --models` for the full list with measured tok/s.

## Requirements
- Node.js 18+
- Claude Code (`npm install -g @anthropic-ai/claude-code`) — the installer adds it if missing.
