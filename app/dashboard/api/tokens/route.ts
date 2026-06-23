// API-key (access-token) management (claude-proxy.js:968-979). add / remove / generate.
/* eslint-disable @typescript-eslint/no-explicit-any */

import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { adminGate, addAccessToken, removeAccessToken, setTokenExpiry } from "@/lib/proxy/auth";
import { buildState } from "@/lib/proxy/state";
import { getDb } from "@/lib/db";
import { accessTokens } from "@/lib/db/schema";

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

  if (body.action === "generate") {
    body.token = crypto.randomBytes(18).toString("hex");
    body.action = "add";
  }
  // Optional expiry (epoch ms) supplied on add/generate; null/absent = never expires.
  const expiresAt =
    typeof body.expiresAt === "number" && Number.isFinite(body.expiresAt) ? body.expiresAt : null;
  const t = (body.token || "").trim();
  if (body.action === "add" && t) addAccessToken(t, expiresAt);
  if (body.action === "remove" && t) removeAccessToken(t);
  if (body.action === "expiry" && t) setTokenExpiry(t, expiresAt);
  if (body.action === "label" && t) {
    getDb()
      .update(accessTokens)
      .set({ label: String(body.label ?? "").slice(0, 40) })
      .where(eq(accessTokens.token, t))
      .run();
  }
  return Response.json({ ...buildState(), generated: body.token });
}
