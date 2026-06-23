// Model self-test (claude-proxy.js:980-983).
/* eslint-disable @typescript-eslint/no-explicit-any */

import { adminGate } from "@/lib/proxy/auth";
import { testModel } from "@/lib/proxy/state";
import { recordModelTest } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

export async function POST(request: Request) {
  const blocked = adminGate(request.headers);
  if (blocked) return blocked;

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  if (!body.model) return Response.json({ error: "model required" }, { status: 400 });
  const result = await testModel(body.model);
  recordModelTest(body.model, result);
  return Response.json(result);
}
