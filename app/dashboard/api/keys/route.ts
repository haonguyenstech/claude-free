// Backend credential edits (claude-proxy.js:959-967). Explicit removal only; a blank Save is a no-op
// (keep), never a delete — so an accidental empty Save can't wipe a credential.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { adminGate } from "@/lib/proxy/auth";
import { setBackendKey, removeBackendKey } from "@/lib/proxy/config";
import { BACKEND_KEYS } from "@/lib/proxy/models";
import { buildState } from "@/lib/proxy/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(request: Request) {
  const blocked = adminGate(request.headers);
  if (blocked) return blocked;

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  const allowed = new Set(BACKEND_KEYS.map((b) => b.id));
  if (body.remove && allowed.has(body.remove)) {
    removeBackendKey(body.remove);
    return Response.json(buildState());
  }
  for (const id of Object.keys(body)) {
    if (allowed.has(id)) {
      const v = (body[id] || "").trim();
      if (v) setBackendKey(id, v); // blank Save is a no-op (keep), never a delete
    }
  }
  return Response.json(buildState());
}
