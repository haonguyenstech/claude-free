// POST /v1/messages/count_tokens (claude-proxy.js:1069-1075). Auth + pause gated like /v1/messages.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { messageGuard } from "@/lib/proxy/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(request: Request) {
  const blocked = messageGuard(request.headers);
  if (blocked) return blocked;

  let n = 0;
  try {
    const body: any = await request.json();
    // Claude Code's real prompts are dominated by the system block + tool schemas, not just the
    // messages — count all three so the estimate isn't a large under-count of the true input size.
    const sized = [body.system, body.messages, body.tools]
      .map((x) => (x ? JSON.stringify(x) : ""))
      .join("");
    n = Math.ceil(sized.length / 4);
  } catch {}
  return Response.json({ input_tokens: n });
}
