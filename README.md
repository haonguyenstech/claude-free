# claude-free

Run **Claude Code** on free AI models (MiMo, Claude, Gemini, OpenRouter, …) through a **hosted
proxy**. Cross-platform: **Windows, macOS, Linux**. A Node.js picker lets you choose a model,
reasoning mode, and permission mode, then launches Claude Code pointed at the proxy server.

The proxy runs on a server you (or your team's operator) deploys once — it holds all the backend
keys/cookies centrally. Each user installs the `claude-free` client, gets an **access token**, and
just uses it. No keys on the client; nothing to configure beyond the token.

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
- **The server** — a **Next.js app** (in `app/` + `src/`, run via Docker) that gates every request
  behind an access token, then translates the Anthropic Messages API ⇄ OpenAI chat completions and
  routes each model to the right backend using **server-side** keys, plus an admin dashboard at
  `/dashboard` for keys, tokens, models, and traffic:
  - `mimo-auto` → Xiaomi free endpoint (self-bootstraps a device fingerprint → JWT, **no key**)
  - `claude-*` → real Claude models via the host's Claude Code subscription (or an Anthropic key)
  - `gemini-*` → Google AI Studio (server key) · `vendor/model:free` → OpenRouter (server key)
  - `tokenrouter/<model>` → TokenRouter (server key)
- `claude-free.js` — the **client/picker**. Points Claude Code at the hosted proxy
  (`CLAUDE_FREE_SERVER`) with your access token, and launches `claude`. It runs no proxy and
  stores no backend keys — only your token (in `~/.claude-free/keys.json`).

## Tiers
- **FREE** — works instantly. No account, no key. Just run `claude-free` and pick MiMo Auto.
- **ANTHROPIC** — real Claude models (Sonnet 4.6, Opus 4.8, Haiku 4.5) via the host's Claude Code
  subscription login on the server. No extra key on the client.
- **GEMINI** — Google AI Studio (Gemini 2.5 Flash-Lite). Uses the server-side Gemini key.
- **OPENROUTER** — curated free, tool-capable models. Needs a (free) server-side OpenRouter key.
  Free models get rate-limited (429) unpredictably, so the proxy sends an OpenRouter **fallback list**
  (your pick + 2 siblings) — if your model is throttled you transparently get an available one.
- **TOKENROUTER** — extra providers (e.g. MiniMax M3). Key lives on the server.

## Authentication
All backend credentials live **on the server**, never on the client. The client authenticates to
the server with a single **access token**:

- The operator generates tokens and lists them in `CLAUDE_FREE_TOKENS` on the server.
- Each user pastes their token once (or sets `CLAUDE_FREE_TOKEN`); it's saved to **their own**
  `~/.claude-free/keys.json` (gitignored). The server rejects any request without a valid token —
  no token configured on the server = every request is refused (fail closed).

This keeps the shared backend accounts/keys from being abused: only token holders can use them.

## Self-hosting the server (Docker)
The proxy is pure Node stdlib — no dependencies. Deploy once:

```bash
cp .env.example .env          # then edit: set CLAUDE_FREE_TOKENS + the backend keys you use
docker compose up -d --build  # serves HTTP on :4002
```

Generate access tokens with:
```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Server environment variables (see `.env.example`):

| Var | Purpose |
|---|---|
| `CLAUDE_FREE_TOKENS` | **Required.** Comma-separated access tokens clients must present. |
| `TOKENROUTER_KEY` / `OPENROUTER_KEY` / `GEMINI_KEY` | API keys for those backends. |
| `PORT` / `CLAUDE_FREE_HOST` | Listen port (default 4002) / bind address (default `127.0.0.1`, loopback-only). Set `CLAUDE_FREE_HOST=0.0.0.0` to expose on the network — only do this behind TLS + a non-default `CLAUDE_FREE_ADMIN_PASSWORD`, since the dashboard holds your backend keys and Claude subscription token. |
| `CLAUDE_FREE_ADMIN_PASSWORD` | Dashboard admin password. If unset, a strong one is generated on first run and printed to the server logs once. |

The container serves plain HTTP. Put it behind a **TLS-terminating reverse proxy** (Caddy, nginx,
Cloudflare, or your platform's load balancer) so clients reach it over `https://your-domain`, then
either bake that URL into `DEFAULT_SERVER` in `claude-free.js` or have users set `CLAUDE_FREE_SERVER`.

Backend keys are still tied to real accounts — e.g. a Gemini key from
<https://aistudio.google.com/apikey>, an OpenRouter key from <https://openrouter.ai/keys>, etc.
Manage them from the dashboard at `/dashboard`.

## Models
| Tier | Models | Backend | Auth |
|---|---|---|---|
| FREE | MiMo Auto ⭐ (1M ctx) | Xiaomi | none |
| ANTHROPIC | Claude Sonnet 4.6 ⭐ · Claude Opus 4.8 · Claude Haiku 4.5 | Claude Code subscription | none (host login) |
| GEMINI | Gemini 2.5 Flash-Lite ⭐ | Google AI Studio | Gemini key |
| OPENROUTER | gpt-oss 120B ⭐ · Nemotron 3 Super (1M) · Gemma 4 31B (262K) · gpt-oss 20B · Nemotron Nano 12B | OpenRouter | OpenRouter key |
| TOKENROUTER | MiniMax M3 (512K) | TokenRouter | API key |

> ⭐ = default pick in its tier. Run `claude-free --models` for the full list with measured tok/s.

## Requirements
- Node.js 18+
- Claude Code (`npm install -g @anthropic-ai/claude-code`) — the installer adds it if missing.
