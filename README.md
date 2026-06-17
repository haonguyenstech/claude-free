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
  - Zen free models → `opencode.ai` (empty bearer, no key)
  - `mimo-auto` → Xiaomi free endpoint (self-bootstraps a device fingerprint → JWT, **no key**)
  - `gemini-*` → Google AI Studio (needs a free key)
  - `vendor/model:free` → OpenRouter (needs a free key)
- `claude-free.js` — the picker. Auto-starts the proxy, handles keys, launches `claude`.

## API keys
Models marked **(needs key)** read the key from, in order:
1. an environment variable (`GEMINI_API_KEY`, `OPENROUTER_API_KEY`), or
2. `~/.claude-free/keys.json` (the picker offers to save it the first time you pick the model).

No-key models (DeepSeek, Big Pickle, North Mini Code, MiMo V2.5, Nemotron, **MiMo Auto**) need nothing.

## Models
| Model | Backend | Key |
|---|---|---|
| DeepSeek V4 Flash ⭐ | Zen | no |
| Big Pickle | Zen | no |
| North Mini Code | Zen | no |
| MiMo V2.5 | Zen | no |
| Nemotron 3 Ultra | Zen | no |
| MiMo Auto (1M ctx) | Xiaomi | no |
| Gemini 2.5 Flash (1M ctx) | Google AI Studio | yes (free) |

## Requirements
- Node.js 18+
- Claude Code (`npm install -g @anthropic-ai/claude-code`) — the installer adds it if missing.
