// Public status-page data. Mirrors a statuspage.io-style summary (overall banner + per-component
// uptime history + incidents), computed entirely from data the proxy already keeps:
//   - request_logs  → per-day success/error rate → the 90-day uptime bars + uptime %
//   - model_tests   → each model's last self-test → current per-component health
//   - server_enabled → the gateway's up/paused state
// Exposes ONLY aggregate health (component names, model names, success rates). No tokens, keys,
// prompts, or per-request payloads — safe to serve unauthenticated at /status.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { and, gte, inArray, sql } from "drizzle-orm";
import { getDb, modelTestMap } from "../db";
import { requestLogs } from "../db/schema";
import { ALLOWED, CLINEPASS_MODELS, MODEL_META } from "./models";
import { serverEnabled } from "./config";

export type StatusLevel = "operational" | "degraded" | "partial" | "major" | "maintenance";
export type DayStatus = "operational" | "degraded" | "partial" | "major" | "nodata";

export type StatusModel = { id: string; name: string; status: "healthy" | "down" | "unknown" };
export type StatusDay = { date: string; status: DayStatus; total: number; errors: number };
export type StatusComponent = {
  key: string;
  name: string;
  description: string;
  status: StatusLevel;
  uptime: number | null; // percent over the window, or null when there's no traffic to measure
  days: StatusDay[];
  models: StatusModel[];
};
export type StatusIncident = { ts: number; level: StatusLevel; title: string; detail: string };
export type StatusPayload = {
  updatedAt: number;
  overall: StatusLevel;
  serverEnabled: boolean;
  windowDays: number;
  components: StatusComponent[];
  incidents: StatusIncident[];
};

const WINDOW_DAYS = 90;
const DAY_MS = 86_400_000;
const RANK: Record<StatusLevel, number> = { operational: 0, degraded: 1, partial: 2, major: 3, maintenance: 0 };

// A single day's health, bucketed by its error rate.
function dayStatus(total: number, errors: number): DayStatus {
  if (total === 0) return "nodata";
  const rate = errors / total;
  if (rate <= 0.01) return "operational";
  if (rate <= 0.05) return "degraded";
  if (rate <= 0.2) return "partial";
  return "major";
}

// Per-day {total, errors} for the given backends (only the surfaced ones are ever passed), keyed by
// UTC date. Traffic from hidden backends never counts toward the public numbers.
function dailyBuckets(backends: string[], sinceMs: number): Map<string, { total: number; errors: number }> {
  const map = new Map<string, { total: number; errors: number }>();
  try {
    const where = and(inArray(requestLogs.backend, backends), gte(requestLogs.ts, sinceMs));
    const rows = getDb()
      .select({
        day: sql<string>`strftime('%Y-%m-%d', ${requestLogs.ts} / 1000, 'unixepoch')`,
        total: sql<number>`count(*)`,
        errors: sql<number>`sum(case when ${requestLogs.status} >= 400 then 1 else 0 end)`,
      })
      .from(requestLogs)
      .where(where)
      .groupBy(sql`1`)
      .all();
    for (const r of rows as any[]) {
      if (r.day) map.set(String(r.day), { total: Number(r.total) || 0, errors: Number(r.errors) || 0 });
    }
  } catch {
    /* no DB / query error → empty history, page still renders "no data" bars */
  }
  return map;
}

// Build the 90-day bar + window uptime % from a day-bucket map.
function buildDays(map: Map<string, { total: number; errors: number }>, now: number) {
  const days: StatusDay[] = [];
  let total = 0;
  let errors = 0;
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const date = new Date(now - i * DAY_MS).toISOString().slice(0, 10);
    const b = map.get(date) ?? { total: 0, errors: 0 };
    total += b.total;
    errors += b.errors;
    days.push({ date, status: dayStatus(b.total, b.errors), total: b.total, errors: b.errors });
  }
  const uptime = total > 0 ? Math.round((1 - errors / total) * 10000) / 100 : null;
  return { days, uptime };
}

// Current component health from the models' last self-tests.
function componentHealth(models: StatusModel[]): StatusLevel {
  const tested = models.filter((m) => m.status !== "unknown");
  const down = tested.filter((m) => m.status === "down");
  if (!tested.length || !down.length) return "operational";
  if (down.length === tested.length) return "major";
  if (down.length * 2 >= tested.length) return "partial";
  return "degraded";
}

function modelsFor(ids: string[], tests: ReturnType<typeof modelTestMap>): StatusModel[] {
  return ids.map((id) => {
    const t = tests[id];
    return {
      id,
      name: MODEL_META[id]?.name ?? id,
      status: t ? (t.ok ? "healthy" : "down") : "unknown",
    };
  });
}

// Short-TTL cache so the status feed costs the same whether 1 or 100 people are watching, and so
// rapid reloads / concurrent pollers don't each re-run the request_logs aggregation. The daily
// history only changes as new requests land, so a few seconds of staleness is harmless.
const CACHE_TTL_MS = 20_000;
let cache: { at: number; payload: StatusPayload } | null = null;

export function buildStatus(): StatusPayload {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.payload;
  const payload = computeStatus();
  cache = { at: payload.updatedAt, payload };
  return payload;
}

function computeStatus(): StatusPayload {
  const now = Date.now();
  const since = now - WINDOW_DAYS * DAY_MS;
  const enabled = (() => {
    try {
      return serverEnabled();
    } catch {
      return true;
    }
  })();
  const tests = (() => {
    try {
      return modelTestMap();
    } catch {
      return {} as ReturnType<typeof modelTestMap>;
    }
  })();

  const openIds = [...new Set(["big-pickle", ...ALLOWED])];
  const clineIds = [...CLINEPASS_MODELS];

  // Proxy gateway — up unless the operator has paused it. Uptime spans the surfaced backends only.
  const gatewayHist = buildDays(dailyBuckets(["zen", "clinepass"], since), now);
  const gateway: StatusComponent = {
    key: "gateway",
    name: "Proxy gateway",
    description: "Anthropic Messages API · /v1/messages",
    status: enabled ? "operational" : "maintenance",
    uptime: gatewayHist.uptime,
    days: gatewayHist.days,
    models: [],
  };

  const backends: { key: string; name: string; description: string; backend: string; ids: string[] }[] = [
    { key: "opencode", name: "OpenCode", description: "opencode.ai Zen · free models", backend: "zen", ids: openIds },
    { key: "clinepass", name: "ClinePass", description: "api.cline.bot · subscription models", backend: "clinepass", ids: clineIds },
  ];

  const backendComponents: StatusComponent[] = backends.map((b) => {
    const models = modelsFor(b.ids, tests);
    const hist = buildDays(dailyBuckets([b.backend], since), now);
    return {
      key: b.key,
      name: b.name,
      description: b.description,
      status: componentHealth(models),
      uptime: hist.uptime,
      days: hist.days,
      models,
    };
  });

  const components = [gateway, ...backendComponents];

  // Overall banner: paused wins (maintenance); otherwise the worst backend health.
  let overall: StatusLevel = "operational";
  if (!enabled) {
    overall = "maintenance";
  } else {
    for (const c of backendComponents) if (RANK[c.status] > RANK[overall]) overall = c.status;
  }

  // Incidents: currently-failing models become open incidents; a paused proxy is a maintenance notice.
  const incidents: StatusIncident[] = [];
  if (!enabled) {
    incidents.push({
      ts: now,
      level: "maintenance",
      title: "Proxy paused by operator",
      detail: "All model requests are currently rejected. The dashboard remains available.",
    });
  }
  for (const b of backends) {
    for (const id of b.ids) {
      const t = tests[id];
      if (t && !t.ok) {
        incidents.push({
          ts: t.ts || now,
          level: "partial",
          title: `${MODEL_META[id]?.name ?? id} — failing health checks`,
          detail: `${b.name} · ${t.status ? `HTTP ${t.status}` : t.error || "the last self-test did not succeed"}`,
        });
      }
    }
  }
  incidents.sort((a, b) => b.ts - a.ts);

  return { updatedAt: now, overall, serverEnabled: enabled, windowDays: WINDOW_DAYS, components, incidents };
}
