"use client"

import { useEffect, useMemo, useState } from "react"
import {
  CheckCircle2,
  AlertTriangle,
  OctagonAlert,
  Wrench,
  ChevronDown,
  RefreshCw,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { fmtAge } from "@/lib/api"
import { LogoMark, Wordmark } from "@/components/brand/logo"
import type { StatusPayload, StatusLevel, DayStatus, StatusComponent } from "@/lib/proxy/status"

const POLL_MS = 60_000

const LEVEL: Record<StatusLevel, { label: string; dot: string; text: string; soft: string; ring: string; icon: typeof CheckCircle2 }> = {
  operational: { label: "Operational", dot: "bg-positive", text: "text-positive", soft: "bg-[#E6F4EA]", ring: "border-[rgba(24,128,56,0.25)]", icon: CheckCircle2 },
  degraded: { label: "Degraded performance", dot: "bg-amber", text: "text-amber", soft: "bg-[#FEF7E0]", ring: "border-[rgba(227,116,0,0.28)]", icon: AlertTriangle },
  partial: { label: "Partial outage", dot: "bg-[#E8710A]", text: "text-[#E8710A]", soft: "bg-[#FEEFE3]", ring: "border-[rgba(232,113,10,0.28)]", icon: AlertTriangle },
  major: { label: "Major outage", dot: "bg-destructive", text: "text-destructive", soft: "bg-[#FCE8E6]", ring: "border-[rgba(217,48,37,0.28)]", icon: OctagonAlert },
  maintenance: { label: "Under maintenance", dot: "bg-mint", text: "text-mint", soft: "bg-accent", ring: "border-[rgba(50,121,249,0.28)]", icon: Wrench },
}

const BANNER: Record<StatusLevel, string> = {
  operational: "All systems operational",
  degraded: "Degraded performance",
  partial: "Partial system outage",
  major: "Major system outage",
  maintenance: "Under maintenance",
}

const DAY_COLOR: Record<DayStatus, string> = {
  operational: "bg-positive",
  degraded: "bg-amber",
  partial: "bg-[#E8710A]",
  major: "bg-destructive",
  nodata: "bg-[#E3E7EE]",
}

export function StatusView({ initial }: { initial: StatusPayload }) {
  const [data, setData] = useState<StatusPayload>(initial)
  const [now, setNow] = useState(initial.updatedAt)

  // Live poll — keep the last good snapshot on error so a blip doesn't blank the page.
  useEffect(() => {
    let alive = true
    const tick = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      try {
        const res = await fetch("/status/api", { cache: "no-store" })
        if (!res.ok) return
        const next = (await res.json()) as StatusPayload
        if (alive) setData(next)
      } catch {
        /* keep last snapshot */
      }
    }
    const poll = window.setInterval(tick, POLL_MS)
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      alive = false
      window.clearInterval(poll)
      window.clearInterval(clock)
    }
  }, [])

  const banner = LEVEL[data.overall]
  const BannerIcon = banner.icon
  const updatedAgo = fmtAge(Math.max(0, Math.floor((now - data.updatedAt) / 1000)))

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-[840px] px-4 pb-20 pt-8 sm:pt-12">
        <header className="mb-7 flex items-center gap-3">
          <LogoMark className="size-9" />
          <div className="flex items-baseline gap-2">
            <Wordmark className="text-[19px]" />
            <span className="text-[14px] font-semibold text-muted-foreground">status</span>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground tnum">
            <RefreshCw className="size-3.5" />
            updated {updatedAgo} ago
          </span>
        </header>

        {/* Overall banner */}
        <div className={cn("flex items-center gap-4 rounded-[var(--radius-xl)] border px-6 py-5", banner.soft, banner.ring)}>
          <span className={cn("grid size-11 shrink-0 place-items-center rounded-full bg-white/70", banner.text)}>
            <BannerIcon className="size-6" />
          </span>
          <div>
            <div className={cn("text-[19px] font-extrabold tracking-[-0.02em]", banner.text)}>{BANNER[data.overall]}</div>
            <div className="text-[12.5px] font-medium text-muted-foreground">
              {data.serverEnabled
                ? "The proxy is accepting requests on all enabled models."
                : "The proxy is paused — requests are currently rejected."}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11.5px] font-semibold text-muted-foreground">
          {(["operational", "degraded", "partial", "major"] as StatusLevel[]).map((l) => (
            <span key={l} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", LEVEL[l].dot)} />
              {LEVEL[l].label}
            </span>
          ))}
        </div>

        {/* Components */}
        <section className="mt-6 flex flex-col gap-3">
          {data.components.map((c) => (
            <ComponentCard key={c.key} c={c} />
          ))}
        </section>

        {/* Incidents */}
        <section className="mt-9">
          <h2 className="mb-3 text-[13px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
            Recent incidents
          </h2>
          {data.incidents.length === 0 ? (
            <div className="rounded-[var(--radius-xl)] border border-border-soft bg-card px-6 py-8 text-center">
              <CheckCircle2 className="mx-auto mb-2 size-6 text-positive" />
              <div className="text-[13.5px] font-bold">No incidents reported</div>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                Everything has been running smoothly across the last {data.windowDays} days.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {data.incidents.map((inc, i) => {
                const lv = LEVEL[inc.level]
                return (
                  <li key={i} className="rounded-[var(--radius-lg)] border border-border bg-card px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className={cn("size-2 rounded-full", lv.dot)} />
                      <span className="text-[13.5px] font-bold tracking-[-0.01em]">{inc.title}</span>
                      <span className={cn("ml-auto text-[11.5px] font-bold", lv.text)}>{lv.label}</span>
                    </div>
                    <p className="mt-1 pl-4 text-[12.5px] text-muted-foreground">{inc.detail}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <footer className="mt-10 border-t border-border-soft pt-5 text-center text-[11.5px] text-muted-foreground">
          Uptime measured from routed requests over the last {data.windowDays} days · claude-free proxy
        </footer>
      </div>
    </div>
  )
}

function ComponentCard({ c }: { c: StatusComponent }) {
  const [open, setOpen] = useState(false)
  const lv = LEVEL[c.status]
  const hasModels = c.models.length > 0

  return (
    <div className="rounded-[var(--radius-xl)] border border-border bg-card px-5 py-4 shadow-[0_1px_2px_rgba(18,19,23,0.03)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {hasModels ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="group inline-flex min-w-0 items-center gap-2 text-left"
            aria-expanded={open}
          >
            <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
            <span className="min-w-0">
              <span className="block text-[14px] font-bold tracking-[-0.01em]">{c.name}</span>
              <span className="block truncate text-[12px] text-muted-foreground">{c.description}</span>
            </span>
          </button>
        ) : (
          <div className="min-w-0 pl-6">
            <span className="block text-[14px] font-bold tracking-[-0.01em]">{c.name}</span>
            <span className="block truncate text-[12px] text-muted-foreground">{c.description}</span>
          </div>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", lv.dot)} />
          <span className={cn("text-[12.5px] font-bold", lv.text)}>{lv.label}</span>
        </span>
      </div>

      <UptimeBar days={c.days} uptime={c.uptime} windowDays={c.days.length} />

      {open && hasModels ? (
        <ul className="mt-3 flex flex-col gap-1.5 border-t border-border-soft pt-3">
          {c.models.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-[12.5px]">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  m.status === "healthy" ? "bg-positive" : m.status === "down" ? "bg-destructive" : "bg-muted-foreground/40",
                )}
              />
              <span className="font-semibold">{m.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{m.id}</span>
              <span
                className={cn(
                  "ml-auto text-[11.5px] font-bold",
                  m.status === "healthy" ? "text-positive" : m.status === "down" ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {m.status === "healthy" ? "operational" : m.status === "down" ? "down" : "not checked"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function UptimeBar({ days, uptime, windowDays }: { days: StatusComponent["days"]; uptime: number | null; windowDays: number }) {
  const label = useMemo(() => (uptime == null ? "no data yet" : `${uptime}% uptime`), [uptime])
  return (
    <div className="mt-3.5">
      <div className="flex h-8 items-stretch gap-[2px]">
        {days.map((d) => (
          <span
            key={d.date}
            className={cn("flex-1 rounded-[2px] transition-colors", DAY_COLOR[d.status])}
            title={
              d.status === "nodata"
                ? `${d.date} · no data`
                : `${d.date} · ${d.total} req${d.total === 1 ? "" : "s"}${d.errors ? ` · ${d.errors} err` : ""}`
            }
          />
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10.5px] font-semibold text-muted-foreground tnum">
        <span>{windowDays} days ago</span>
        <span className="text-foreground">{label}</span>
        <span>today</span>
      </div>
    </div>
  )
}
