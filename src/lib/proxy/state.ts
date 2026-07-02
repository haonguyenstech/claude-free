// Dashboard state builder + model self-test. Ports claude-proxy.js:847-852, 889-953.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { ALLOWED, CLINEPASS_MODELS, MODEL_META, BACKEND_KEYS } from "./models";
import { sql } from "drizzle-orm";
import { getSetting, serverEnabled, disabledModelSet, adminPassword } from "./config";
import { allowedTokens } from "./auth";
import { getDb, modelTestMap, type ModelTest } from "../db";
import { requestLogs, accessTokens } from "../db/schema";
import { stats } from "./stats";
import { routeMessages } from "./core";

// Cosmetic build marker shown in the dashboard footer (replaces the source-file hash; the Next build
// is many files, and claude-free's stale-detection only applied to the legacy local-proxy mode).
export const SRC_HASH = "nextjs";

export type TestResult = { ok: boolean; ms?: number; status?: number; sample?: string; error?: string; tps?: number };

export function maskSecret(s: unknown): string {
  if (!s) return "";
  s = String(s);
  const str = s as string;
  if (str.length <= 8) return "•".repeat(str.length);
  return str.slice(0, 4) + "…" + str.slice(-4) + "  (" + str.length + " chars)";
}

// Full access-token rows for the dashboard gate, including per-key usage + label. Falls back to [] on
// any DB error so the dashboard still renders. (touchToken keeps requestCount/lastUsedAt fresh.)
function gateTokens() {
  try {
    return getDb()
      .select()
      .from(accessTokens)
      .all()
      .map((r) => ({
        masked: maskSecret(r.token),
        value: r.token,
        label: r.label ?? null,
        requestCount: Number(r.requestCount ?? 0),
        lastUsedAt: r.lastUsedAt ?? null,
        createdAt: Number(r.createdAt ?? 0),
        expiresAt: r.expiresAt ?? null,
      }));
  } catch {
    return [];
  }
}

function modelEntry(id: string, alias: string, off: Set<string>, tests: Record<string, ModelTest>) {
  const m = MODEL_META[alias] || { name: alias, ctx: "", tps: 0 };
  // Measured throughput from the last self-test supersedes the static MODEL_META estimate.
  const t = tests[id] ?? null;
  return { id, name: m.name, ctx: m.ctx, tps: t?.tps ?? m.tps, enabled: !off.has(id), lastTest: t };
}

// Aggregate the persistent request log for the dashboard's Traffic + counters.
function dbStats() {
  const db = getDb();
  const total = Number(db.select({ c: sql<number>`count(*)` }).from(requestLogs).get()?.c ?? 0);
  const errors = Number(
    db.select({ c: sql<number>`count(*)` }).from(requestLogs).where(sql`status >= 400`).get()?.c ?? 0,
  );
  const rows = db
    .select({ backend: requestLogs.backend, c: sql<number>`count(*)` })
    .from(requestLogs)
    .groupBy(requestLogs.backend)
    .all();
  const byBackend: Record<string, number> = {};
  for (const r of rows) if (r.backend) byBackend[r.backend] = Number(r.c);
  const last = db
    .select({ model: requestLogs.model, ts: requestLogs.ts })
    .from(requestLogs)
    .orderBy(sql`ts desc`)
    .limit(1)
    .get();
  return { total, errors, byBackend, lastModel: last?.model ?? "", lastAt: last?.ts ?? 0 };
}

export function buildState() {
  const off = disabledModelSet();
  const tests = modelTestMap();
  const backends = BACKEND_KEYS.map((b) => {
    const envVal = process.env[b.envVar];
    const stored = getSetting(b.id) || "";
    const val = envVal || stored;
    return {
      id: b.id,
      label: b.label,
      hint: b.hint,
      set: !!val,
      masked: maskSecret(val),
      fromEnv: !!envVal,
      value: envVal ? "" : stored,
      link: b.link,
      linkLabel: b.linkLabel,
    };
  });
  const tokens = gateTokens();
  return {
    server: {
      host: process.env.CLAUDE_FREE_HOST || process.env.HOSTNAME || "127.0.0.1",
      port: Number(process.env.PORT || process.env.CLAUDE_FREE_PORT || 4002),
      pid: process.pid,
      node: process.version,
      srcHash: SRC_HASH,
      uptimeSec: Math.floor((Date.now() - stats.startedAt) / 1000),
      adminProtected: !!adminPassword(),
      enabled: serverEnabled(),
    },
    gate: { count: tokens.length, tokens },
    backends,
    // Only the two surfaced tiers are shipped to the dashboard. The other backends still route
    // server-side (parseModel/core.ts) but are intentionally hidden from the operator UI.
    models: {
      opencode: [...new Set(["big-pickle", ...ALLOWED])].map((id) => modelEntry(id, id, off, tests)),
      clinepass: CLINEPASS_MODELS.map((id) => modelEntry(id, id, off, tests)),
    },
    stats: dbStats(),
  };
}

// Test a model by routing a tiny real request through the SAME dispatch path /v1/messages uses
// (routing + backend + translation). The original made an HTTP self-call to exercise auth too;
// Next has no listening-socket handle here, so we invoke the post-auth dispatch directly after the
// same "no token configured" precheck the operator cares about.
export async function testModel(model: string): Promise<TestResult> {
  const toks = allowedTokens();
  if (!toks.length) return { ok: false, error: "no API key configured on server" };
  // 128, not 16: some backends (Cline's Kimi/MiMo) spend tokens on reasoning even when asked not
  // to, and a budget that leaves no room for visible text makes the test fail or sample "".
  // The prompt asks for a short burst (not just "pong") so the run emits enough output tokens to
  // measure throughput — a 2-token reply is all TTFT and would report ~1 tok/s for every model.
  const areq = {
    model,
    max_tokens: 128,
    messages: [{ role: "user", content: "Reply with the word pong, then the numbers 1 to 30 separated by spaces." }],
    stream: false,
  };
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 40000);
  try {
    const res = await routeMessages(areq, new Headers(), ac.signal);
    const ms = Date.now() - t0;
    let j: any;
    try {
      j = await res.json();
    } catch {
      return { ok: false, ms, status: res.status, error: "non-JSON response" };
    }
    if (res.status === 200 && j.type === "message") {
      const sample = (j.content || [])
        .filter((x: any) => x.type === "text")
        .map((x: any) => x.text)
        .join("")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
      // Rough measured throughput: output tokens over total wall time (includes TTFT, so it
      // understates a bit). Only trusted when the reply is long enough that TTFT doesn't dominate;
      // otherwise leave tps undefined and the last/static value stands.
      const outTok = Number(j.usage?.output_tokens);
      const tps = outTok >= 16 && ms > 0 ? Math.max(1, Math.round((outTok / ms) * 1000)) : undefined;
      return { ok: true, ms, status: 200, sample, tps };
    }
    const err = (j.error && j.error.message) || j.message || "HTTP " + res.status;
    return { ok: false, ms, status: res.status, error: String(err).slice(0, 160) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}
