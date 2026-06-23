// Paginated, filterable query over the persistent request_logs table (see db/schema.ts), powering
// the dashboard Logs page. Builds a WHERE from the supplied filters, returns one page of rows plus
// the total count under the same filters and the distinct model/backend facets for the dropdowns.
import { sql, and, eq, gte, desc, isNotNull, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import { requestLogs } from "../db/schema";

export type LogStatusFilter = "all" | "ok" | "error";

export type QueryLogsOpts = {
  limit: number;
  offset: number;
  model?: string;
  backend?: string;
  status?: LogStatusFilter;
  sinceHours?: number;
};

export type LogRow = {
  id: number;
  ts: number;
  model: string;
  backend: string;
  status: number;
  latencyMs: number;
  ttftMs: number;
  inputTokens: number;
  outputTokens: number;
  stream: boolean;
};

export type LogsResult = {
  rows: LogRow[];
  total: number;
  hasMore: boolean;
  facets: { models: string[]; backends: string[] };
};

const HOUR_MS = 3_600_000;

const EMPTY: LogsResult = { rows: [], total: 0, hasMore: false, facets: { models: [], backends: [] } };

// Build the shared WHERE clause from the filter options (used by both the paged query and the export).
function logFilters(opts: Pick<QueryLogsOpts, "model" | "backend" | "status" | "sinceHours">): SQL | undefined {
  const filters: SQL[] = [];
  if (opts.model) filters.push(eq(requestLogs.model, opts.model));
  if (opts.backend) filters.push(eq(requestLogs.backend, opts.backend));
  if (opts.status === "ok") {
    filters.push(sql`${requestLogs.status} >= 200 and ${requestLogs.status} < 400`);
  } else if (opts.status === "error") {
    filters.push(gte(requestLogs.status, 400));
  }
  if (opts.sinceHours && opts.sinceHours > 0) {
    filters.push(gte(requestLogs.ts, Date.now() - opts.sinceHours * HOUR_MS));
  }
  return filters.length ? and(...filters) : undefined;
}

// All matching rows (newest first) up to a hard cap, for CSV export. No pagination. Best-effort: [].
export function exportLogRows(
  opts: Pick<QueryLogsOpts, "model" | "backend" | "status" | "sinceHours">,
  cap = 10000,
): LogRow[] {
  try {
    const where = logFilters(opts);
    const rows = getDb()
      .select()
      .from(requestLogs)
      .where(where)
      .orderBy(desc(requestLogs.ts))
      .limit(Math.max(1, Math.min(50000, cap)))
      .all();
    return rows.map((r) => ({
      id: Number(r.id),
      ts: Number(r.ts),
      model: r.model ?? "",
      backend: r.backend ?? "",
      status: Number(r.status ?? 0),
      latencyMs: Number(r.latencyMs ?? 0),
      ttftMs: Number(r.ttftMs ?? 0),
      inputTokens: Number(r.inputTokens ?? 0),
      outputTokens: Number(r.outputTokens ?? 0),
      stream: !!r.stream,
    }));
  } catch {
    return [];
  }
}

export function queryLogs(opts: QueryLogsOpts): LogsResult {
  try {
    const db = getDb();
    const limit = Math.max(1, Math.min(200, Math.floor(opts.limit) || 50));
    const offset = Math.max(0, Math.floor(opts.offset) || 0);

    const where = logFilters(opts);

    const rows = db
      .select()
      .from(requestLogs)
      .where(where)
      .orderBy(desc(requestLogs.ts))
      .limit(limit)
      .offset(offset)
      .all();

    const countRow = db
      .select({ n: sql<number>`count(*)` })
      .from(requestLogs)
      .where(where)
      .get();
    const total = Number(countRow?.n ?? 0);

    // Facets span the entire table (not the current filter) so the dropdowns stay stable.
    const modelRows = db
      .selectDistinct({ model: requestLogs.model })
      .from(requestLogs)
      .where(isNotNull(requestLogs.model))
      .orderBy(requestLogs.model)
      .all();
    const backendRows = db
      .selectDistinct({ backend: requestLogs.backend })
      .from(requestLogs)
      .where(isNotNull(requestLogs.backend))
      .orderBy(requestLogs.backend)
      .all();

    const mapped: LogRow[] = rows.map((r) => ({
      id: Number(r.id),
      ts: Number(r.ts),
      model: r.model ?? "",
      backend: r.backend ?? "",
      status: Number(r.status ?? 0),
      latencyMs: Number(r.latencyMs ?? 0),
      ttftMs: Number(r.ttftMs ?? 0),
      inputTokens: Number(r.inputTokens ?? 0),
      outputTokens: Number(r.outputTokens ?? 0),
      stream: !!r.stream,
    }));

    return {
      rows: mapped,
      total,
      hasMore: offset + mapped.length < total,
      facets: {
        models: modelRows.map((r) => r.model).filter((m): m is string => !!m),
        backends: backendRows.map((r) => r.backend).filter((b): b is string => !!b),
      },
    };
  } catch {
    return EMPTY;
  }
}
