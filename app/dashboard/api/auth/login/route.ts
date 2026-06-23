// Dashboard login. Verifies email + password against the users table and, on success, opens a
// session and sets the HttpOnly session cookie. Throttled per email to slow password guessing.
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  verifyCredentials,
  createSession,
  sessionCookie,
  isHttps,
  loginBlocked,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/proxy/users";
import { rateLimit } from "@/lib/proxy/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(request: Request) {
  // Brute-force protection: rate-limit every login POST per client IP (first x-forwarded-for hop,
  // else "local") before touching credentials, on top of the existing per-email throttle.
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  const rl = rateLimit("login:" + ip);
  if (!rl.ok) {
    return Response.json(
      { error: "too many attempts, try again later" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
    );
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const email = String(body.email ?? "").toLowerCase().trim();
  const password = String(body.password ?? "");

  if (loginBlocked(email)) {
    return Response.json({ error: "too many attempts — try again later" }, { status: 429 });
  }
  if (!verifyCredentials(email, password)) {
    recordLoginFailure(email);
    return Response.json({ error: "invalid email or password" }, { status: 401 });
  }
  recordLoginSuccess(email);
  const { id, expiresAt } = createSession(email);
  return Response.json(
    { email },
    { headers: { "Set-Cookie": sessionCookie(id, expiresAt, isHttps(request.headers)) } },
  );
}
