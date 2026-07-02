// Public system-status page (statuspage.io-style), modelled on status.claude.com. Rendered outside
// the auth-gated dashboard so it stays reachable to anyone. SSR-seeds real data from buildStatus(),
// then the client view live-polls /status/api.
import type { Metadata } from "next";

import { buildStatus } from "@/lib/proxy/status";
import { StatusView } from "@/components/status/status-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "System status",
  description: "Live availability of the claude-free proxy and its model backends.",
};

export default function StatusPage() {
  return <StatusView initial={buildStatus()} />;
}
