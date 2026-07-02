# claude-free

Run **Claude Code** on free OpenCode models from a simple cross-platform CLI. Install once, paste
your access token, pick a model, and start Claude Code.

## Install

One command. It installs Node.js and Claude Code if missing, drops the program in
`~/.claude-free` (or `%USERPROFILE%\.claude-free`), and adds a `claude-free` command to your PATH.

### Windows — Command Prompt (cmd.exe, no PowerShell)

```bat
curl -fsSLo "%TEMP%\cf-install.bat" https://raw.githubusercontent.com/haonguyenstech/claude-free/main/install.bat && "%TEMP%\cf-install.bat"
```

After installing, open a **new Command Prompt** and run:

```bat
claude-free
```

### Windows — PowerShell

```powershell
irm https://raw.githubusercontent.com/haonguyenstech/claude-free/main/install.ps1 | iex
```

### macOS / Linux / WSL / Git Bash

```bash
curl -fsSL https://raw.githubusercontent.com/haonguyenstech/claude-free/main/install.sh | bash
```

Then open a **new terminal** and run:

```bash
claude-free
```

## First Run

1. Run `claude-free`.
2. Paste your access token when prompted.
3. Pick a model.
4. Claude Code starts with that model.

The token is saved locally so you do not need to paste it every time.

## Update

Run the same installer again to refresh the local `claude-free` picker. Your saved access token stays
in `~/.claude-free/keys.json` or `%USERPROFILE%\.claude-free\keys.json`.

## Configuration

Most users only need to run `claude-free` and paste their token. You can also set values with
environment variables:

```bash
CLAUDE_FREE_SERVER=https://your-domain.example CLAUDE_FREE_TOKEN=your-token claude-free
```

Saved client config locations:

```text
~/.claude-free/keys.json
%USERPROFILE%\.claude-free\keys.json
```

## Models

| Tier | Models |
|---|---|
| OPENCODE | North Mini Code ⭐ · DeepSeek V4 Flash · Big Pickle · MiMo V2.5 · Nemotron 3 Ultra |
| CLINEPASS | GLM-5.2 · Kimi K2.7 Code · Kimi K2.6 · DeepSeek V4 Pro · DeepSeek V4 Flash · MiMo-V2.5 · MiMo-V2.5-Pro · MiniMax M3 · Qwen3.7 Max · Qwen3.7 Plus |

> ⭐ = default pick. Run `claude-free --models` for the full model list.

## Requirements

- Node.js 18+
- Claude Code (`npm install -g @anthropic-ai/claude-code`) — the installer adds it if missing.

## Troubleshooting

| Problem | Fix |
|---|---|
| `claude-free` is not found | Open a new terminal after installing so PATH changes load. On Windows, open a new Command Prompt. |
| Token is rejected | Check that you pasted the full access token. If it still fails, request a fresh token. |
| Model request fails | Try another model from the picker, then run `claude-free` again after a short wait. |
