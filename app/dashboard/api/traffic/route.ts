import { adminGate } from "@/lib/proxy/auth";
import { buildTraffic } from "@/lib/proxy/traffic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(request: Request) {
  const blocked = adminGate(request.headers);
  if (blocked) return blocked;
  return Response.json(buildTraffic());
}
