// Log out — destroys the session row and clears the cookie.
import { readSessionCookie, deleteSession, clearSessionCookie, isHttps } from "@/lib/proxy/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(request: Request) {
  const id = readSessionCookie(request.headers);
  if (id) deleteSession(id);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie(isHttps(request.headers)) } });
}
