# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`claude-free` lets users run **Claude Code against free/cheap AI models** through a self-hosted
proxy. Two halves ship from one repo:

- **The server** — a Next.js app (`app/` + `src/`) that exposes an **Anthropic Messages API**
  (`/v1/messages`), translates it to/from **OpenAI chat-completions**, and routes each model to the
  right backend using server-side keys. It also serves an operator **dashboard** at `/dashboard`.
- **`claude-free.js`** — a standalone, dependency-free Node CLI **picker/launcher** (the client).
  It points Claude Code at the hosted proxy via `ANTHROPIC_BASE_URL` + an access token and spawns
  `claude`. It holds no backend keys — only the user's access token in `~/.claude-free/keys.json`.

The server is the main codebase. `claude-free.js` is a single self-contained file distributed via
the `install.{sh,ps1,bat}` scripts; edit it directly, don't add deps.

## Commands

```bash
npm run dev          # next dev (local server)
npm run build        # next build (output: "standalone")
npm start            # next start -H ${CLAUDE_FREE_HOST:-127.0.0.1} -p ${PORT:-4002}
npm run typecheck    # tsc --noEmit — there is no test suite; this is the main correctness gate

npm run db:generate  # drizzle-kit generate (after editing src/lib/db/schema.ts)
npm run db:migrate   # drizzle-kit migrate
npm run db:push      # drizzle-kit push
npm run db:studio    # drizzle-kit studio

docker compose up -d --build   # production deploy (standalone image, serves HTTP)
```

There is **no linter config and no test runner** — `npm run typecheck` is the check to run after
changes. Verify proxy behavior end-to-end by hitting `/v1/messages` or using the dashboard's
per-model self-test (Models page → calls `state.ts:testModel`, the same routing path as live traffic).

## Request flow (the hot path)

`POST /v1/messages` (`app/v1/messages/route.ts`) → `routeMessages` (`src/lib/proxy/core.ts`) is the
core dispatch. Guard order is load-bearing and must be preserved:

1. `messageGuard` (`auth.ts`) — access-token gate (fail-closed: no tokens configured = reject all),
   then the operator pause switch (`server_enabled`).
2. Per-model disable check (`disabledModelSet`).
3. `parseModel` (`translate.ts`) maps the requested model name → a `Backend` + clean model id.
4. Dispatch by backend.

**Backends** (`parseModel` decides which by name prefix):
- `anthropic` (`claude*`) and `cli` (`cli/claude-*`) — **native Anthropic passthrough**, forwarded
  verbatim to `api.anthropic.com` (no OpenAI round-trip) for 100% Claude fidelity (tools, subagents,
  streaming). `cli` prefers the host's Claude Code **subscription OAuth token** (`claude-auth.ts`,
  read from the macOS keychain or `~/.claude/.credentials.json`, with the `oauth-2025-04-20` beta
  flag), then a configured Anthropic key, then the local `claude -p` CLI (`cli.ts`).
- `tokenrouter` / `openrouter` / `gemini` / `mimo` / `zen` — translated to OpenAI chat-completions
  via `toOpenAI`, sent through `callBackend`, and translated back via `toAnthropic` (non-stream) or
  `streamTranslate` (SSE). `mimo` self-bootstraps a JWT (`mimo.ts`, no key); the rest use a
  server-side key from `serverKey()`.

**Two translation paths, don't conflate them:**
- OpenAI-compatible backends go through `translate.ts` (`toOpenAI`/`toAnthropic`/`streamTranslate`).
  `streamTranslate` converts an OpenAI SSE stream to Anthropic SSE and strips `<think>...</think>`.
- Anthropic/CLI backends bypass translation entirely (`upstream.ts:anthropicPassthrough`) — bytes
  are forwarded verbatim through a `PassThrough` while a tap sniffs the SSE for real token usage.

When editing `translate.ts` / `upstream.ts`: the comments cite line numbers in a prior
`claude-proxy.js` — these are historical provenance, not a file in this repo. The streaming
translation is intentionally preserved byte-for-byte; change it carefully.

### Backend-specific quirks baked into the code
- **MiMo (Xiaomi)** returns `403 "Illegal access"` unless the system prompt contains the exact
  `MIMO_MARKER` sentence (`models.ts`); `toOpenAI` prepends it.
- **OpenRouter free models** get throttled (429) unpredictably, so `core.ts` attaches a fallback
  list (the picked model + 2 siblings, capped at 3) so a throttled pick yields a sibling's answer.
- **Gemini 2.5** "thinking" silently eats the whole `max_tokens` budget — disabled (`reasoning_effort:
  "none"`) unless the request opts in.
- A `:think` model suffix keeps reasoning ON for that request; without it, reasoning is disabled.
- `LANG_RULE` is injected into every system prompt to stop models switching languages.

## Persistence & config

SQLite via **better-sqlite3 + Drizzle** (`src/lib/db/`). DB file resolves from `CLAUDE_FREE_DB` or
`<DATA_DIR>/claude-free.db` (`env.ts`; `DATA_DIR` = `CLAUDE_FREE_HOME` or cwd). Key points:

- Schema is created **idempotently at runtime** in `db/index.ts:ensureSchema` (raw `CREATE TABLE IF
  NOT EXISTS` + `addColumnIfMissing`), NOT via `drizzle-kit migrate`. The live DB predates the
  migration files, so runtime migrate would conflict. The files in `drizzle/` are the canonical
  history for `drizzle-kit generate`/`push` only. **If you add a column, update both** `schema.ts`
  and the raw DDL/`addColumnIfMissing` calls in `ensureSchema`.
- On a fresh DB, config is seeded from a legacy `keys.json` once (`seed.ts:seedFromKeysJson`) and a
  default admin user is created (`seedAdminUser`).
- Tables: `settings` (scalar config incl. backend creds + `server_enabled` + `admin_password`),
  `access_tokens` (proxy API keys, gate `/v1/messages`), `disabled_models`, `request_logs` (usage
  log powering Traffic; 30-day retention swept on first DB open), `rate_limits`, `model_tests`,
  `users` + `sessions` (dashboard login).

**Config precedence** (`config.ts`): env var (`*_KEY` / `*_API_KEY`, `CLAUDE_FREE_OFF`,
`CLAUDE_FREE_ADMIN`) **overrides** the DB settings row. Config is read **fresh on every request** so
dashboard edits and pause/disable toggles take effect immediately — don't cache it across requests.

**Two distinct credential systems** — keep them separate:
- **Access tokens** (`access_tokens` / `CLAUDE_FREE_TOKENS`) gate the **proxy API** (`/v1/messages`).
  Compared with `crypto.timingSafeEqual`.
- **Dashboard login** (`users`/`sessions`, or the `x-admin-password` header escape hatch) gates the
  **`/dashboard/api/*`** admin endpoints (`adminGate`). Loopback is explicitly NOT trusted.

## Dashboard

`app/dashboard/` is the operator UI (React 19, Tailwind v4, Radix, `src/components/ui/`). Pages:
overview, credentials, tokens, models, traffic, logs. Its API routes live under
`app/dashboard/api/*` and all sit behind `adminGate`. Client state via hooks in `src/hooks/`
(`use-dashboard`, `use-auth`, `use-toast`).

## Usage logging (subtle, intentionally best-effort)

Logging must **never throw or delay a request** — every DB write in the log path is wrapped in
try/catch. For streams, the real token counts only arrive in the final SSE chunk, so the row is
logged up front with `outputTokens: null` and **backfilled** when the stream ends (`backfill` in
`route.ts` + `updateRequestLogTokens`). The completion callback can fire *before* the log row's id
is assigned (a fast/empty stream resolves first), so counts are stashed in `pending` and applied
once `logId` exists. TTFT and true total latency are computed from upstream first/last-byte
timestamps reported via the `onComplete` callback. Rate-limit headers are parsed and recorded off
the hot path (`setImmediate`).

## Deployment notes

- `next.config.ts` uses `output: "standalone"`; better-sqlite3 is a `serverExternalPackages` native
  module traced into the bundle. The Docker image runs `node server.js` **as root** so a bind-mounted
  `/data` volume (owned by root on some platforms) is writable for the SQLite file.
- The container serves **plain HTTP** — put it behind a TLS-terminating reverse proxy. Exposing it
  (`CLAUDE_FREE_HOST=0.0.0.0`) without TLS + a strong `CLAUDE_FREE_ADMIN_PASSWORD` leaks every stored
  backend key and the Claude subscription token via the dashboard.
- `instrumentation.ts` starts a model **health scheduler** (`health.ts`) once per server boot, Node
  runtime only.
- Note: `package.json`/README mention port 4002; `.env.example` and the Docker image default to 3000.
  The client's baked-in `DEFAULT_SERVER` is `http://127.0.0.1:3000` (override with `CLAUDE_FREE_SERVER`).

## Model catalog is duplicated — keep both in sync

The list of models exists in **two** places that must agree:
- Server: `src/lib/proxy/models.ts` (routing sets `ANTHROPIC_MODELS`, `CLI_MODELS`,
  `OPENROUTER_FREE_MODELS`, `TOKENROUTER_MODELS`, `GEMINI_MODELS`, plus `MODEL_META` for the
  dashboard display).
- Client: the `MODELS` array in `claude-free.js` (the picker, with `tier`/`tps`/`ctx`/`star`).

Adding or renaming a model means editing both. `claude-free.js` also carries its own `VERSION`
(bump it on client-facing changes; commits follow `claude-free vX.Y.Z: ...`).
