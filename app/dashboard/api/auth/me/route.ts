// Current dashboard session — returns the logged-in user's email, or 401 if not signed in.
import { sessionEmail } from "@/lib/proxy/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(request: Request) {
  const email = sessionEmail(request.headers);
  if (!email) return Response.json({ error: "unauthenticated" }, { status: 401 });
  return Response.json({ email });
}
