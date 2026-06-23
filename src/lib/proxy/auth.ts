// Access-token gate + dashboard admin gate. Tokens now live in SQLite (was keys.json access_tokens),
// with per-token usage metadata. Runs on the Node runtime so crypto.timingSafeEqual is available.

import crypto from "node:crypto";
import { sql, eq } from "drizzle-orm";
import { getDb } from "../db";
import { accessTokens } from "../db/schema";
import { adminPassword, serverEnabled } from "./config";
import { sessionEmail } from "./users";
import { jsonError } from "./errors";

// Tokens come from CLAUDE_FREE_TOKENS (comma-separated env) or the DB. None configured = fail closed.
// Expired DB tokens (expiresAt in the past) are excluded so they stop authenticating; env tokens have
// no expiry. The row stays in the table so the operator can still see/extend it from the dashboard.
export function allowedTokens(): string[] {
  const env = (process.env.CLAUDE_FREE_TOKENS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const now = Date.now();
  const rows = getDb().select({ token: accessTokens.token, expiresAt: accessTokens.expiresAt }).from(accessTokens).all();
  const live = rows.filter((r) => !r.expiresAt || r.expiresAt > now).map((r) => r.token);
  return env.concat(live);
}

export function addAccessToken(token: string, expiresAt?: number | null) {
  getDb()
    .insert(accessTokens)
    .values({ token, createdAt: Date.now(), expiresAt: expiresAt ?? null })
    .onConflictDoNothing()
    .run();
}
// Set/clear a token's expiry (epoch ms; null = never). Best-effort; no-op if the token doesn't exist.
export function setTokenExpiry(token: string, expiresAt: number | null) {
  try {
    getDb().update(accessTokens).set({ expiresAt }).where(eq(accessTokens.token, token)).run();
  } catch {}
}
export function removeAccessToken(token: string) {
  getDb().delete(accessTokens).where(eq(accessTokens.token, token)).run();
}
// Bump usage counters for a token after a successful authed request (no-op for env-only tokens).
export function touchToken(token: string) {
  if (!token) return;
  try {
    getDb()
      .update(accessTokens)
      .set({ lastUsedAt: Date.now(), requestCount: sql`${accessTokens.requestCount} + 1` })
      .where(eq(accessTokens.token, token))
      .run();
  } catch {}
}

export function bearerToken(h: Headers): string {
  const a = h.get("authorization") || "";
  const m = a.match(/^Bearer\s+(.+)$/i);
  return (m ? m[1] : h.get("x-api-key") || "").trim();
}

export function tokenMatches(allowed: string, got: string): boolean {
  const a = Buffer.from(String(allowed));
  const b = Buffer.from(String(got));
  if (a.length !== b.length) return false; // length check avoids timingSafeEqual throwing
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function checkAuth(h: Headers): boolean {
  const tokens = allowedTokens();
  if (!tokens.length) return false;
  const got = bearerToken(h);
  return !!got && tokens.some((t) => tokenMatches(t, got));
}

// Gate for /v1/messages[/count_tokens]: access token then operator pause switch.
export function messageGuard(h: Headers): Response | null {
  if (!checkAuth(h)) {
    return jsonError(401, "invalid or missing API key — set ANTHROPIC_AUTH_TOKEN to an API key this server accepts", "authentication_error");
  }
  if (!serverEnabled()) {
    return jsonError(503, "proxy is paused by the operator — re-enable it from the dashboard");
  }
  return null;
}

// Admin gate for /dashboard/api/*. Requires either a valid login session (the primary credential,
// carried in an HttpOnly SameSite cookie) or the explicit admin-password header (ops escape hatch).
// Loopback is NOT trusted: the only signal for it is the client-supplied x-forwarded-for header,
// which is forgeable, and the proxy may be bound to a public interface — so trusting it would expose
// every stored credential and mutation endpoint unauthenticated. Login is the gate.
export function adminGate(h: Headers): Response | null {
  if (sessionEmail(h)) return null;
  const pw = adminPassword();
  if (pw && tokenMatches(pw, (h.get("x-admin-password") || "").toString())) return null;
  return Response.json({ error: "unauthorized", needsPassword: !!pw }, { status: 401 });
}
