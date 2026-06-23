"use client"

import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { useDashboard } from "@/hooks/use-dashboard"

const TITLES: Record<string, { title: string; sub: string }> = {
  "/dashboard/overview": { title: "Overview", sub: "Live health of your free-model gateway" },
  "/dashboard/models": { title: "Models served", sub: "Every model the proxy can route — test them live" },
  "/dashboard/credentials": { title: "Backend credentials", sub: "Keys that power the paid & keyed tiers" },
  "/dashboard/tokens": { title: "API keys", sub: "Who is allowed to use this proxy" },
  "/dashboard/traffic": { title: "Traffic", sub: "Requests routed, by backend" },
  "/dashboard/logs": { title: "Logs", sub: "Every request routed through the proxy" },
}

export function Topbar() {
  const pathname = usePathname()
  const { state, error } = useDashboard()
  const meta = TITLES[pathname] ?? TITLES["/dashboard/overview"]
  const reachable = !!state && !error
  const paused = reachable && state!.server.enabled === false
  const status: "online" | "paused" | "offline" = !reachable ? "offline" : paused ? "paused" : "online"
  const cls = {
    online: { box: "bg-mint-soft text-positive", dot: "bg-mint shadow-[0_0_0_3px_rgba(24,224,140,0.3)]" },
    paused: { box: "bg-[#fff4e2] text-amber", dot: "bg-amber" },
    offline: { box: "bg-[#fdecea] text-destructive", dot: "bg-destructive" },
  }[status]

  return (
    <header className="mb-6 flex flex-wrap items-center gap-3">
      <div>
        <h1 className="text-[24px] font-extrabold tracking-[-0.035em]">{meta.title}</h1>
        <p className="mt-0.5 text-[13.5px] font-medium text-muted-foreground">{meta.sub}</p>
      </div>
      <span className="flex-1" />
      <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] font-bold", cls.box)}>
        <span className={cn("size-2 rounded-full", cls.dot)} />
        {status}
      </span>
    </header>
  )
}
