// SQLite connection (better-sqlite3 + Drizzle). Schema is created idempotently on first open, and on
// a fresh DB we seed config from the existing keys.json once — so the current tokens/keys carry over
// with zero manual migration. Singleton per process.
/* eslint-disable @typescript-eslint/no-explicit-any */
import Database from "better-sqlite3";
import { eq, lt, sql } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { DB_FILE } from "../env";
import * as schema from "./schema";
import { requestLogs, modelTests, rateLimits } from "./schema";
import { seedFromKeysJson, seedAdminUser } from "./seed";

let _db: BetterSQLite3Database<typeof schema> | null = null;

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (_db) return _db;
  const sqlite = new Database(DB_FILE);
  sqlite.pragma("journal_mode = WAL");
  ensureSchema(sqlite);
  _db = drizzle(sqlite, { schema });
  seedFromKeysJson(sqlite);
  seedAdminUser(sqlite);
  // One-shot retention sweep on first open (no per-request cost).
  pruneRequestLogs();
  return _db;
}

// Idempotent schema creation. We keep this (rather than running migrate() at runtime) because the
// live DB predates the migration files — migrate() would conflict with already-existing tables. The
// generated migrations in drizzle/ are the canonical history for `drizzle-kit generate/push`.
export function ensureSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS access_tokens (
      token TEXT PRIMARY KEY, label TEXT, created_at INTEGER NOT NULL,
      last_used_at INTEGER, request_count INTEGER NOT NULL DEFAULT 0, expires_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS disabled_models (model_id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS rate_limits (
      model_id TEXT PRIMARY KEY, ts INTEGER NOT NULL, status INTEGER,
      requests_remaining INTEGER, requests_limit INTEGER,
      tokens_remaining INTEGER, tokens_limit INTEGER, reset_at INTEGER, retry_after INTEGER
    );
    CREATE TABLE IF NOT EXISTS model_tests (
      model_id TEXT PRIMARY KEY, ts INTEGER NOT NULL, ok INTEGER NOT NULL,
      status INTEGER, latency_ms INTEGER, sample TEXT, error TEXT
    );
    CREATE TABLE IF NOT EXISTS request_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, token TEXT, model TEXT,
      backend TEXT, status INTEGER, latency_ms INTEGER, ttft_ms INTEGER, input_tokens INTEGER,
      output_tokens INTEGER, stream INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_request_logs_ts ON request_logs(ts);
    CREATE INDEX IF NOT EXISTS idx_request_logs_backend ON request_logs(backend);
    CREATE INDEX IF NOT EXISTS idx_request_logs_token ON request_logs(token);
    CREATE INDEX IF NOT EXISTS idx_request_logs_model ON request_logs(model);
    CREATE TABLE IF NOT EXISTS users (
      email TEXT PRIMARY KEY, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);
  `);

  // Additive columns for DBs created before these features shipped. CREATE TABLE IF NOT EXISTS leaves
  // an existing table's columns untouched, so add them explicitly (idempotent — guarded by table_info).
  addColumnIfMissing(sqlite, "request_logs", "ttft_ms", "INTEGER");
  addColumnIfMissing(sqlite, "request_logs", "cost_usd", "REAL");
  addColumnIfMissing(sqlite, "access_tokens", "expires_at", "INTEGER");
  addColumnIfMissing(sqlite, "model_tests", "tps", "REAL");
}

// ALTER TABLE ADD COLUMN, but only if the column isn't already present (ADD COLUMN throws otherwise).
function addColumnIfMissing(sqlite: Database.Database, table: string, column: string, ddl: string) {
  try {
    const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    }
  } catch {}
}

// Best-effort usage log (never throws — logging must not break a request). Returns the inserted row
// id so the stream path can backfill output tokens once the SSE stream ends; undefined on failure.
export function logRequest(entry: {
  token?: string | null;
  model?: string | null;
  backend?: string | null;
  status?: number | null;
  latencyMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  stream?: number | null;
}): number | undefined {
  try {
    const result = getDb()
      .insert(requestLogs)
      .values({ ts: Date.now(), ...entry })
      .run();
    return Number(result.lastInsertRowid);
  } catch {
    return undefined;
  }
}

// Backfill token counts for a previously-logged row (used by the stream path at stream end). Output
// tokens are always known at stream end; input tokens are backfilled too when the upstream reports a
// real count (Anthropic/CLI passthrough), replacing the rough up-front estimate. Best-effort: no-op
// on a falsy id, never throws.
export function updateRequestLogTokens(id: number, outputTokens: number, inputTokens?: number, ttftMs?: number, latencyMs?: number, costUsd?: number) {
  if (!id) return;
  try {
    const set: { outputTokens: number; inputTokens?: number; ttftMs?: number; latencyMs?: number; costUsd?: number } = { outputTokens };
    if (typeof inputTokens === "number" && inputTokens > 0) set.inputTokens = inputTokens;
    if (typeof ttftMs === "number" && ttftMs >= 0) set.ttftMs = ttftMs;
    if (typeof costUsd === "number" && costUsd > 0) set.costUsd = costUsd;
    // Replace the up-front (response-start) latency with the true total once the stream has finished.
    if (typeof latencyMs === "number" && latencyMs >= 0) set.latencyMs = latencyMs;
    getDb()
      .update(requestLogs)
      .set(set)
      .where(eq(requestLogs.id, id))
      .run();
  } catch {}
}

// Upsert the latest rate-limit snapshot for a model (best-effort — never throws). Called off the hot
// path (setImmediate) from the Anthropic/CLI passthrough once response headers arrive.
export type RateLimitInfo = {
  status?: number | null;
  requestsRemaining?: number | null;
  requestsLimit?: number | null;
  tokensRemaining?: number | null;
  tokensLimit?: number | null;
  resetAt?: number | null;
  retryAfter?: number | null;
};
export function recordRateLimit(modelId: string, info: RateLimitInfo) {
  if (!modelId) return;
  try {
    const row = {
      modelId,
      ts: Date.now(),
      status: info.status ?? null,
      requestsRemaining: info.requestsRemaining ?? null,
      requestsLimit: info.requestsLimit ?? null,
      tokensRemaining: info.tokensRemaining ?? null,
      tokensLimit: info.tokensLimit ?? null,
      resetAt: info.resetAt ?? null,
      retryAfter: info.retryAfter ?? null,
    };
    getDb()
      .insert(rateLimits)
      .values(row)
      .onConflictDoUpdate({ target: rateLimits.modelId, set: { ...row } })
      .run();
  } catch {}
}

export type RateLimitRow = RateLimitInfo & { modelId: string; ts: number };
// All rate-limit snapshots, newest first, for the dashboard. Empty on any DB error.
export function rateLimitRows(): RateLimitRow[] {
  try {
    return getDb()
      .select()
      .from(rateLimits)
      .all()
      .map((r) => ({
        modelId: r.modelId,
        ts: Number(r.ts),
        status: r.status ?? null,
        requestsRemaining: r.requestsRemaining ?? null,
        requestsLimit: r.requestsLimit ?? null,
        tokensRemaining: r.tokensRemaining ?? null,
        tokensLimit: r.tokensLimit ?? null,
        resetAt: r.resetAt ?? null,
        retryAfter: r.retryAfter ?? null,
      }))
      .sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

// Retention sweep: drop request_logs rows older than maxAgeDays. Best-effort, never throws. Called
// once when the DB singleton is created, so old rows are pruned without any per-request cost.
export function pruneRequestLogs(maxAgeDays = 30) {
  try {
    const cutoff = Date.now() - maxAgeDays * 86400000;
    getDb()
      .delete(requestLogs)
      .where(lt(requestLogs.ts, cutoff))
      .run();
  } catch {}
}

export type ModelTest = {
  ts: number;
  ok: boolean;
  status: number | null;
  ms: number | null;
  sample: string | null;
  error: string | null;
  tps: number | null;
};

// Upsert the latest self-test result for a model (best-effort — never throws).
export function recordModelTest(
  modelId: string,
  r: { ok: boolean; ms?: number; status?: number; sample?: string; error?: string; tps?: number },
) {
  try {
    const row = {
      modelId,
      ts: Date.now(),
      ok: r.ok ? 1 : 0,
      status: r.status ?? null,
      latencyMs: r.ms ?? null,
      sample: r.sample ?? null,
      error: r.error ?? null,
      tps: r.tps ?? null,
    };
    getDb()
      .insert(modelTests)
      .values(row)
      .onConflictDoUpdate({
        target: modelTests.modelId,
        // A failed/unmeasured test keeps the last measured throughput instead of clearing it.
        set: {
          ts: row.ts,
          ok: row.ok,
          status: row.status,
          latencyMs: row.latencyMs,
          sample: row.sample,
          error: row.error,
          tps: sql`coalesce(excluded.tps, ${modelTests.tps})`,
        },
      })
      .run();
  } catch {}
}

// Map of model id -> last test result, for the dashboard Models page.
export function modelTestMap(): Record<string, ModelTest> {
  try {
    const rows = getDb().select().from(modelTests).all();
    const out: Record<string, ModelTest> = {};
    for (const r of rows) {
      out[r.modelId] = {
        ts: Number(r.ts),
        ok: !!r.ok,
        status: r.status ?? null,
        ms: r.latencyMs ?? null,
        sample: r.sample ?? null,
        error: r.error ?? null,
        tps: r.tps ?? null,
      };
    }
    return out;
  } catch {
    return {};
  }
}
