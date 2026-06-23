import { adminGate } from "@/lib/proxy/auth";
import { queryLogs, type LogStatusFilter } from "@/lib/proxy/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(request: Request) {
  const blocked = adminGate(request.headers);
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);

  const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);
  const model = searchParams.get("model") || undefined;
  const backend = searchParams.get("backend") || undefined;
  const statusParam = searchParams.get("status");
  const status: LogStatusFilter =
    statusParam === "ok" || statusParam === "error" ? statusParam : "all";
  const sinceRaw = searchParams.get("sinceHours");
  const sinceHours = sinceRaw != null && sinceRaw !== "" && Number.isFinite(Number(sinceRaw)) ? Number(sinceRaw) : undefined;

  return Response.json(queryLogs({ limit, offset, model, backend, status, sinceHours }));
}
