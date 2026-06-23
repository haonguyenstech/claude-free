// GET /dashboard/api/logs/export — the current request log (under the same filters as the Logs page)
// as a CSV download. Admin-gated like every other dashboard endpoint.
import { adminGate } from "@/lib/proxy/auth";
import { exportLogRows, type LogStatusFilter } from "@/lib/proxy/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const COLS = ["id", "ts", "iso", "model", "backend", "status", "latencyMs", "ttftMs", "inputTokens", "outputTokens", "stream"] as const;

// Minimal RFC-4180 CSV escaping: quote fields containing a comma, quote or newline, doubling quotes.
function csv(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const blocked = adminGate(request.headers);
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const model = searchParams.get("model") || undefined;
  const backend = searchParams.get("backend") || undefined;
  const statusParam = searchParams.get("status");
  const status: LogStatusFilter = statusParam === "ok" || statusParam === "error" ? statusParam : "all";
  const sinceRaw = searchParams.get("sinceHours");
  const sinceHours = sinceRaw != null && sinceRaw !== "" && Number.isFinite(Number(sinceRaw)) ? Number(sinceRaw) : undefined;

  const rows = exportLogRows({ model, backend, status, sinceHours });
  const lines = [COLS.join(",")];
  for (const r of rows) {
    lines.push(
      [r.id, r.ts, new Date(r.ts).toISOString(), r.model, r.backend, r.status, r.latencyMs, r.ttftMs, r.inputTokens, r.outputTokens, r.stream ? 1 : 0]
        .map(csv)
        .join(","),
    );
  }
  const body = lines.join("\n");
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="claude-free-logs.csv"',
      "cache-control": "no-store",
    },
  });
}
