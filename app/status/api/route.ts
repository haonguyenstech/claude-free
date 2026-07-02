// Public status feed — no auth (a status page is meant to be reachable when the proxy is degraded).
// Returns only aggregate health; see src/lib/proxy/status.ts for what is and isn't exposed.
import { buildStatus } from "@/lib/proxy/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(buildStatus(), { headers: { "cache-control": "no-store" } });
}
