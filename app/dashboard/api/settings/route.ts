// On/off switches (claude-proxy.js:987-1002). {target:"server",enabled} pauses/resumes the whole
// proxy; {target:"model",id,enabled} toggles one model; {target:"backend",id,value} sets/removes a
// backend key. Persisted to SQLite.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { adminGate } from "@/lib/proxy/auth";
import { setServerEnabledFlag, setModelDisabled, setBackendKey, removeBackendKey } from "@/lib/proxy/config";
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

  if (body.target === "server") {
    setServerEnabledFlag(body.enabled !== false);
    return Response.json(buildState());
  }
  if (body.target === "model" && body.id) {
    setModelDisabled(body.id, body.enabled === false);
    return Response.json(buildState());
  }
  if (body.target === "backend" && body.id) {
    if (body.value === "" || body.value === null || body.value === undefined) {
      removeBackendKey(body.id);
    } else {
      setBackendKey(body.id, String(body.value));
    }
    return Response.json(buildState());
  }
  return Response.json({ error: "bad settings request" }, { status: 400 });
}
