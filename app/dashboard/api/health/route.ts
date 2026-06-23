// Health-check schedule control + manual run trigger. GET reads the current config; POST either runs
// the checks now ({action:"run"}) or updates the schedule ({enabled?,intervalMin?}).
/* eslint-disable @typescript-eslint/no-explicit-any */

import { adminGate } from "@/lib/proxy/auth";
import { getHealthConfig, setHealthConfig, runHealthChecks } from "@/lib/proxy/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(request: Request) {
  const blocked = adminGate(request.headers);
  if (blocked) return blocked;

  return Response.json({ config: getHealthConfig() });
}

export async function POST(request: Request) {
  const blocked = adminGate(request.headers);
  if (blocked) return blocked;

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  if (body.action === "run") {
    const result = await runHealthChecks();
    return Response.json({ config: getHealthConfig(), result });
  }

  const config = setHealthConfig({ enabled: body.enabled, intervalMin: body.intervalMin });
  return Response.json({ config });
}
