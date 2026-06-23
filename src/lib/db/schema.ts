// Drizzle schema (SQLite). Replaces the flat keys.json:
//  - settings: scalar config (backend creds, admin_password, server_enabled, _seeded marker)
//  - access_tokens: the API keys that gate the proxy, with usage metadata
//  - disabled_models: per-model operator off-switch
//  - request_logs: persistent usage log (powers the Traffic page + per-key counts)
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
});

export const accessTokens = sqliteTable("access_tokens", {
  token: text("token").primaryKey(),
  label: text("label"),
  createdAt: integer("created_at").notNull(),
  lastUsedAt: integer("last_used_at"),
  requestCount: integer("request_count").notNull().default(0),
  // Optional expiry (epoch ms). null = never expires. Expired tokens are excluded from allowedTokens.
  expiresAt: integer("expires_at"),
});

// Latest rate-limit snapshot per (Anthropic) model, parsed from the `anthropic-ratelimit-*` and
// `retry-after` response headers. One row per model id, upserted off the hot path so the dashboard
// can show remaining quota + reset countdown for the CLI/Anthropic models (the 429-prone ones).
export const rateLimits = sqliteTable("rate_limits", {
  modelId: text("model_id").primaryKey(),
  ts: integer("ts").notNull(),
  status: integer("status"),
  requestsRemaining: integer("requests_remaining"),
  requestsLimit: integer("requests_limit"),
  tokensRemaining: integer("tokens_remaining"),
  tokensLimit: integer("tokens_limit"),
  resetAt: integer("reset_at"), // epoch ms of the soonest window reset
  retryAfter: integer("retry_after"), // seconds, from a 429's retry-after header
});

export const disabledModels = sqliteTable("disabled_models", {
  modelId: text("model_id").primaryKey(),
});

// Last self-test result per model (one row per model id) — powers the "last tested … ago" status
// on the dashboard Models page so results survive reloads. Upserted on every test run.
export const modelTests = sqliteTable("model_tests", {
  modelId: text("model_id").primaryKey(),
  ts: integer("ts").notNull(),
  ok: integer("ok").notNull(),
  status: integer("status"),
  latencyMs: integer("latency_ms"),
  sample: text("sample"),
  error: text("error"),
});

// Dashboard login accounts. Credentials live here (email + scrypt password hash); seeded with a
// default admin on first run. Distinct from access_tokens (which gate the proxy API, not the UI).
export const users = sqliteTable("users", {
  email: text("email").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull(),
});

// Server-side login sessions — a random opaque id stored in an HttpOnly cookie, with an expiry.
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("idx_sessions_email").on(t.email)],
);

export const requestLogs = sqliteTable(
  "request_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ts: integer("ts").notNull(),
    token: text("token"),
    model: text("model"),
    backend: text("backend"),
    status: integer("status"),
    latencyMs: integer("latency_ms"),
    ttftMs: integer("ttft_ms"), // time to first streamed byte (stream requests only)
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    stream: integer("stream"),
  },
  (t) => [index("idx_request_logs_ts").on(t.ts), index("idx_request_logs_backend").on(t.backend)],
);
