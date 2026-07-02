// Rich traffic aggregation for the dashboard Traffic page. Reads the persistent
// request_logs table (see db/schema.ts) and rolls it up into totals, per-backend and
// per-model breakdowns, a 24h hourly time series, and the most recent requests.
import { sql } from "drizzle-orm";
import { getDb, rateLimitRows, type RateLimitRow } from "../db";
import { requestLogs, accessTokens } from "../db/schema";
import { maskSecret } from "./state";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WINDOW_HOURS = 24;
const WINDOW_DAYS = 14;

export type RecentRequest = {
  ts: number;
  model: string;
  backend: string;
  status: number;
  latencyMs: number;
  ttftMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  stream: boolean;
};

export type ModelPerf = {
  model: string;
  count: number;
  costUsd: number; // summed real gateway-reported cost (0 when the backend never reports one)
  avgTtftMs: number | null; // null when no streamed sample with a TTFT
  tokPerSec: number | null; // decode throughput (output tokens / decode time), null when unknown
};

export type TokenUsage = {
  masked: string;
  label: string | null;
  count: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  lastAt: number | null;
};

export type TrafficData = {
  totals: {
    total: number;
    errors: number;
    successRate: number; // 0..100
    avgLatencyMs: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  byBackend: { backend: string; count: number; errors: number }[];
  byModel: ModelPerf[];
  byToken: TokenUsage[];
  // One bucket per hour for the last 24h, oldest first. `t` is the bucket-start epoch (ms).
  series: { t: number; count: number; errors: number }[];
  // One bucket per day for the last 14d, oldest first — token-volume rollup. `t` = day-start epoch.
  daily: { t: number; count: number; inputTokens: number; outputTokens: number; costUsd: number }[];
  rateLimits: RateLimitRow[];
  recent: RecentRequest[];
  lastAt: number | null;
};

export function buildTraffic(): TrafficData {
  const db = getDb();
  const now = Date.now();

  const agg = db
    .select({
      total: sql<number>`count(*)`,
      errors: sql<number>`sum(case when status >= 400 then 1 else 0 end)`,
      avgLatency: sql<number>`avg(latency_ms)`,
      inTok: sql<number>`coalesce(sum(input_tokens), 0)`,
      outTok: sql<number>`coalesce(sum(output_tokens), 0)`,
      cost: sql<number>`coalesce(sum(cost_usd), 0)`,
      lastAt: sql<number>`max(ts)`,
    })
    .from(requestLogs)
    .get();

  const total = Number(agg?.total ?? 0);
  const errors = Number(agg?.errors ?? 0);

  const backendRows = db
    .select({
      backend: requestLogs.backend,
      count: sql<number>`count(*)`,
      errors: sql<number>`sum(case when status >= 400 then 1 else 0 end)`,
    })
    .from(requestLogs)
    .groupBy(requestLogs.backend)
    .orderBy(sql`count(*) desc`)
    .all();

  // Per-model volume + performance. avgTtft and decode throughput come only from successful streamed
  // rows that recorded a TTFT; tok/s = output tokens / decode time (latency minus the first-byte wait).
  const modelRows = db
    .select({
      model: requestLogs.model,
      count: sql<number>`count(*)`,
      cost: sql<number>`coalesce(sum(cost_usd), 0)`,
      avgTtft: sql<number>`avg(case when ttft_ms is not null and status >= 200 and status < 400 then ttft_ms end)`,
      outSum: sql<number>`coalesce(sum(case when ttft_ms is not null and latency_ms > ttft_ms and status >= 200 and status < 400 then output_tokens else 0 end), 0)`,
      decodeMs: sql<number>`coalesce(sum(case when ttft_ms is not null and latency_ms > ttft_ms and status >= 200 and status < 400 then latency_ms - ttft_ms else 0 end), 0)`,
    })
    .from(requestLogs)
    .groupBy(requestLogs.model)
    .orderBy(sql`count(*) desc`)
    .limit(8)
    .all();

  // Hourly buckets for the last 24h. Group in SQL, then fill gaps so the chart has a fixed width.
  const since = now - WINDOW_HOURS * HOUR_MS;
  const bucketRows = db
    .select({
      h: sql<number>`cast(ts / ${HOUR_MS} as integer)`,
      count: sql<number>`count(*)`,
      errors: sql<number>`sum(case when status >= 400 then 1 else 0 end)`,
    })
    .from(requestLogs)
    .where(sql`ts >= ${since}`)
    .groupBy(sql`cast(ts / ${HOUR_MS} as integer)`)
    .all();

  const byHour = new Map<number, { count: number; errors: number }>();
  for (const r of bucketRows) {
    byHour.set(Number(r.h), { count: Number(r.count), errors: Number(r.errors ?? 0) });
  }
  const currentHour = Math.floor(now / HOUR_MS);
  const series: TrafficData["series"] = [];
  for (let i = WINDOW_HOURS - 1; i >= 0; i--) {
    const h = currentHour - i;
    const hit = byHour.get(h);
    series.push({ t: h * HOUR_MS, count: hit?.count ?? 0, errors: hit?.errors ?? 0 });
  }

  // Per-day token-volume rollup for the last 14d. Group in SQL, then fill gaps for a fixed width.
  const sinceDay = now - WINDOW_DAYS * DAY_MS;
  const dayRows = db
    .select({
      d: sql<number>`cast(ts / ${DAY_MS} as integer)`,
      count: sql<number>`count(*)`,
      inTok: sql<number>`coalesce(sum(input_tokens), 0)`,
      outTok: sql<number>`coalesce(sum(output_tokens), 0)`,
      cost: sql<number>`coalesce(sum(cost_usd), 0)`,
    })
    .from(requestLogs)
    .where(sql`ts >= ${sinceDay}`)
    .groupBy(sql`cast(ts / ${DAY_MS} as integer)`)
    .all();
  const byDay = new Map<number, { count: number; inTok: number; outTok: number; cost: number }>();
  for (const r of dayRows) {
    byDay.set(Number(r.d), { count: Number(r.count), inTok: Number(r.inTok ?? 0), outTok: Number(r.outTok ?? 0), cost: Number(r.cost ?? 0) });
  }
  const currentDay = Math.floor(now / DAY_MS);
  const daily: TrafficData["daily"] = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const d = currentDay - i;
    const hit = byDay.get(d);
    daily.push({ t: d * DAY_MS, count: hit?.count ?? 0, inputTokens: hit?.inTok ?? 0, outputTokens: hit?.outTok ?? 0, costUsd: hit?.cost ?? 0 });
  }

  // Per-token usage (top 8 by volume). Labels come from access_tokens; env-only tokens have no row,
  // so they're labelled by their masked value alone. The raw token is masked before leaving the server.
  const tokenRows = db
    .select({
      token: requestLogs.token,
      count: sql<number>`count(*)`,
      errors: sql<number>`sum(case when status >= 400 then 1 else 0 end)`,
      inTok: sql<number>`coalesce(sum(input_tokens), 0)`,
      outTok: sql<number>`coalesce(sum(output_tokens), 0)`,
      cost: sql<number>`coalesce(sum(cost_usd), 0)`,
      lastAt: sql<number>`max(ts)`,
    })
    .from(requestLogs)
    .where(sql`${requestLogs.token} is not null and ${requestLogs.token} <> ''`)
    .groupBy(requestLogs.token)
    .orderBy(sql`count(*) desc`)
    .limit(8)
    .all();
  const labelRows = db.select({ token: accessTokens.token, label: accessTokens.label }).from(accessTokens).all();
  const labelMap = new Map(labelRows.map((r) => [r.token, r.label ?? null]));
  const byToken: TokenUsage[] = tokenRows.map((r) => ({
    masked: maskSecret(r.token),
    label: labelMap.get(r.token as string) ?? null,
    count: Number(r.count),
    errors: Number(r.errors ?? 0),
    inputTokens: Number(r.inTok ?? 0),
    outputTokens: Number(r.outTok ?? 0),
    costUsd: Number(r.cost ?? 0),
    lastAt: r.lastAt ? Number(r.lastAt) : null,
  }));

  const recentRows = db
    .select()
    .from(requestLogs)
    .orderBy(sql`ts desc`)
    .limit(25)
    .all();

  const recent: RecentRequest[] = recentRows.map((r) => ({
    ts: Number(r.ts),
    model: r.model ?? "",
    backend: r.backend ?? "",
    status: Number(r.status ?? 0),
    latencyMs: Number(r.latencyMs ?? 0),
    ttftMs: Number(r.ttftMs ?? 0),
    inputTokens: Number(r.inputTokens ?? 0),
    outputTokens: Number(r.outputTokens ?? 0),
    costUsd: r.costUsd != null ? Number(r.costUsd) : null,
    stream: !!r.stream,
  }));

  return {
    totals: {
      total,
      errors,
      successRate: total ? Math.round(((total - errors) / total) * 1000) / 10 : 100,
      avgLatencyMs: Math.round(Number(agg?.avgLatency ?? 0)),
      inputTokens: Number(agg?.inTok ?? 0),
      outputTokens: Number(agg?.outTok ?? 0),
      costUsd: Number(agg?.cost ?? 0),
    },
    byBackend: backendRows
      .filter((r) => r.backend)
      .map((r) => ({ backend: r.backend as string, count: Number(r.count), errors: Number(r.errors ?? 0) })),
    byModel: modelRows
      .filter((r) => r.model)
      .map((r) => {
        const decodeMs = Number(r.decodeMs ?? 0);
        const outSum = Number(r.outSum ?? 0);
        return {
          model: r.model as string,
          count: Number(r.count),
          costUsd: Number(r.cost ?? 0),
          avgTtftMs: r.avgTtft != null ? Math.round(Number(r.avgTtft)) : null,
          tokPerSec: decodeMs > 0 && outSum > 0 ? Math.round((outSum / (decodeMs / 1000)) * 10) / 10 : null,
        };
      }),
    byToken,
    series,
    daily,
    rateLimits: rateLimitRows(),
    recent,
    lastAt: agg?.lastAt ? Number(agg.lastAt) : null,
  };
}
