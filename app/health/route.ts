// Unauthenticated liveness probe (claude-proxy.js:1040). Used by load balancers / Docker healthchecks.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true });
}
