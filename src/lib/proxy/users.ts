// Dashboard auth: credential check + server-side login sessions. Sessions are random opaque ids
// kept in an HttpOnly cookie and a `sessions` DB row with an expiry. Node runtime (crypto).
import crypto from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { getDb } from "../db";
import { users, sessions } from "../db/schema";
import { verifyPassword } from "./password";

export const SESSION_COOKIE = "cf_session";
const TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// ---- Login brute-force throttle (in-memory, per email) ----
// Defense-in-depth against guessing weak passwords. Resets on restart; per-process only — adequate
// for a single-node dashboard. Keyed by email so a target account is protected regardless of source.
const MAX_ATTEMPTS = 8;
const LOCK_WINDOW_MS = 1000 * 60 * 10; // 10 minutes
const attempts = new Map<string, { count: number; until: number }>();

export function loginBlocked(email: string): boolean {
  const a = attempts.get(normEmail(email));
  if (!a) return false;
  if (a.until < Date.now()) {
    attempts.delete(normEmail(email));
    return false;
  }
  return a.count >= MAX_ATTEMPTS;
}

export function recordLoginFailure(email: string) {
  const key = normEmail(email);
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.until < now) attempts.set(key, { count: 1, until: now + LOCK_WINDOW_MS });
  else a.count++;
}

export function recordLoginSuccess(email: string) {
  attempts.delete(normEmail(email));
}

const normEmail = (e: unknown) => String(e ?? "").toLowerCase().trim();

export function verifyCredentials(email: string, password: string): boolean {
  const e = normEmail(email);
  if (!e || !password) return false;
  const row = getDb().select().from(users).where(eq(users.email, e)).get();
  return !!row && verifyPassword(password, row.passwordHash);
}

export function createSession(email: string): { id: string; expiresAt: number } {
  const id = crypto.randomBytes(24).toString("hex");
  const now = Date.now();
  const expiresAt = now + TTL_MS;
  getDb().insert(sessions).values({ id, email: normEmail(email), createdAt: now, expiresAt }).run();
  // Opportunistic cleanup of expired rows so the table doesn't grow unbounded.
  try {
    getDb().delete(sessions).where(lt(sessions.expiresAt, now)).run();
  } catch {}
  return { id, expiresAt };
}

export function deleteSession(id: string) {
  if (id) getDb().delete(sessions).where(eq(sessions.id, id)).run();
}

export function readSessionCookie(h: Headers): string | null {
  const cookie = h.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

// The logged-in user's email for a request, or null. Expired sessions are dropped.
export function sessionEmail(h: Headers): string | null {
  const id = readSessionCookie(h);
  if (!id) return null;
  const row = getDb().select().from(sessions).where(eq(sessions.id, id)).get();
  if (!row) return null;
  if (row.expiresAt < Date.now()) {
    deleteSession(id);
    return null;
  }
  return row.email;
}

// Is this request served over HTTPS? Used to add the cookie's Secure flag (which can't be set on
// plain-HTTP localhost or the browser drops the cookie and login breaks).
export function isHttps(h: Headers): boolean {
  return (h.get("x-forwarded-proto") || "").split(",")[0].trim().toLowerCase() === "https";
}

export function sessionCookie(id: string, expiresAt: number, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${id}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}
