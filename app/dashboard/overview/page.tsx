"use client"

import { useState } from "react"
import Link from "next/link"
import {
  ArrowDownUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Boxes,
  KeyRound,
  ShieldCheck,
  ArrowUpRight,
  Power,
  Copy,
  Check,
  Server,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { useDashboard } from "@/hooks/use-dashboard"
import { useToast } from "@/hooks/use-toast"
import { countServedModels, fmtAge, setServerEnabled, type Backend, type DashboardState } from "@/lib/api"

type Tone = "green" | "red" | "amber" | "dark"
const toneCls: Record<Tone, string> = {
  green: "bg-mint-soft text-positive",
  red: "bg-[#fdecea] text-destructive",
  amber: "bg-[#fff4e2] text-amber",
  dark: "bg-secondary text-forest",
}

export default function OverviewPage() {
  const { state, setState } = useDashboard()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function toggleServer(next: boolean) {
    setBusy(true)
    try {
      setState(await setServerEnabled(next))
      toast(next ? "proxy resumed" : "proxy paused")
    } catch (e) {
      toast(e instanceof Error ? e.message : "failed to toggle")
    } finally {
      setBusy(false)
    }
  }

  if (!state) {
    return (
      <div className="flex flex-col gap-[18px]">
        <Skeleton className="h-[92px] rounded-[var(--radius-xl)]" />
        <div className="grid grid-cols-2 gap-[18px] xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-[var(--radius-md)]" />
          ))}
        </div>
        <div className="grid gap-[18px] lg:grid-cols-2">
          <Skeleton className="h-64 rounded-[var(--radius-xl)]" />
          <Skeleton className="h-64 rounded-[var(--radius-xl)]" />
        </div>
      </div>
    )
  }

  const on = state.server.enabled
  const modelCount = countServedModels(state.models)
  const liveBackends = state.backends.filter((b) => b.set)
  const total = state.stats.total
  const successRate = total ? Math.round(((total - state.stats.errors) / total) * 1000) / 10 : 100
  const host = state.server.host === "0.0.0.0" ? "localhost" : state.server.host
  const endpoint = `http://${host}:${state.server.port}`
  const lastAgo =
    state.stats.lastAt != null && state.stats.lastAt > 0
      ? fmtAge(Math.floor((Date.now() - state.stats.lastAt) / 1000))
      : null

  const stats: { label: string; value: string | number; icon: LucideIcon; tone: Tone; sub?: string }[] = [
    { label: "Requests", value: state.stats.total, icon: ArrowDownUp, tone: "dark" },
    {
      label: "Success rate",
      value: `${successRate}%`,
      icon: CheckCircle2,
      tone: successRate >= 99 ? "green" : successRate >= 90 ? "amber" : "red",
      sub: `${state.stats.errors} error${state.stats.errors === 1 ? "" : "s"}`,
    },
    { label: "Uptime", value: fmtAge(state.server.uptimeSec), icon: Clock, tone: "dark" },
    { label: "Models served", value: modelCount, icon: Boxes, tone: "dark" },
    {
      label: "Backends live",
      value: `${liveBackends.length}/${state.backends.length}`,
      icon: KeyRound,
      tone: liveBackends.length ? "green" : "dark",
    },
    { label: "API keys", value: state.gate.count, icon: ShieldCheck, tone: state.gate.count ? "dark" : "amber" },
  ]

  return (
    <div className="flex flex-col gap-[18px]">
      <Card
        className={cn(
          "flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-5 transition-colors",
          on ? "" : "border-[rgba(229,86,75,0.35)] bg-[#fdecea]",
        )}
      >
        <span
          className={cn(
            "grid size-11 place-items-center rounded-[12px]",
            on ? "bg-mint-soft text-positive" : "bg-white text-destructive",
          )}
        >
          <Power className="size-5" />
        </span>
        <div className="min-w-[180px]">
          <div className="text-[15px] font-extrabold tracking-[-0.02em]">
            {on ? "Proxy is running" : "Proxy is paused"}
          </div>
          <div className="text-[12.5px] font-medium text-muted-foreground">
            {on ? "Accepting requests on all enabled models" : "All model requests are rejected — dashboard stays up"}
          </div>
        </div>
        <span className="flex-1" />
        <Endpoint url={endpoint} />
        <span className={cn("text-[12.5px] font-bold", on ? "text-positive" : "text-destructive")}>
          {on ? "ON" : "OFF"}
        </span>
        <Switch
          checked={on}
          disabled={busy}
          onCheckedChange={toggleServer}
          aria-label={on ? "Pause proxy" : "Resume proxy"}
        />
      </Card>

      <section className="grid grid-cols-2 gap-[18px] xl:grid-cols-3">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <Card
              key={s.label}
              className="rounded-[var(--radius-md)] px-[18px] pb-4 pt-[18px] transition-all hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(10,40,30,0.05),0_24px_48px_-16px_rgba(10,40,30,0.22)]"
            >
              <div className="flex items-center gap-2.5 text-[12.5px] font-semibold text-muted-foreground">
                <span className={cn("grid size-8 place-items-center rounded-[9px]", toneCls[s.tone])}>
                  <Icon className="size-4" />
                </span>
                {s.label}
              </div>
              <div className="mt-3 break-all text-[26px] font-extrabold tracking-[-0.04em] tnum">{s.value}</div>
              {s.sub ? <div className="mt-0.5 text-[11.5px] font-medium text-muted-foreground">{s.sub}</div> : null}
            </Card>
          )
        })}
      </section>

      <div className="grid gap-[18px] lg:grid-cols-2">
        <BackendsPanel backends={state.backends} />
        <ServerPanel state={state} lastAgo={lastAgo} />
      </div>
    </div>
  )
}

function Endpoint({ url }: { url: string }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast("endpoint copied")
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast("copy failed")
    }
  }
  return (
    <button
      onClick={copy}
      className="group inline-flex items-center gap-2 rounded-[10px] border border-border bg-muted px-3 py-2 font-mono text-[12px] font-semibold text-forest transition-colors hover:bg-secondary"
      title="Copy proxy endpoint"
    >
      {url}
      {copied ? (
        <Check className="size-3.5 text-positive" />
      ) : (
        <Copy className="size-3.5 text-muted-foreground group-hover:text-forest" />
      )}
    </button>
  )
}

function BackendsPanel({ backends }: { backends: Backend[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-border-soft px-6 py-4">
        <span className="grid size-8 place-items-center rounded-[9px] bg-secondary text-forest">
          <KeyRound className="size-4" />
        </span>
        <div className="text-[14px] font-extrabold tracking-[-0.02em]">Backends</div>
        <span className="flex-1" />
        <Link
          href="/dashboard/credentials"
          className="inline-flex items-center gap-1 text-[12.5px] font-bold text-positive hover:underline"
        >
          Manage <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
      <ul className="px-6">
        {backends.map((b) => (
          <li key={b.id} className="flex items-center gap-3 border-b border-border-soft py-3 last:border-0">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                b.set ? "bg-mint shadow-[0_0_0_3px_rgba(24,224,140,0.25)]" : "bg-border",
              )}
            />
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-bold tracking-[-0.01em]">{b.label}</div>
              <div className="truncate font-mono text-[11px] text-muted-foreground">{b.set ? b.masked : b.hint}</div>
            </div>
            <span className="flex-1" />
            {b.fromEnv ? (
              <span className="rounded-[6px] bg-secondary px-2 py-0.5 text-[10.5px] font-bold text-forest">env</span>
            ) : null}
            <span
              className={cn(
                "rounded-[6px] px-2 py-0.5 text-[11px] font-bold",
                b.set ? "bg-mint-soft text-positive" : "bg-muted text-muted-foreground",
              )}
            >
              {b.set ? "live" : "missing"}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function ServerPanel({ state, lastAgo }: { state: DashboardState; lastAgo: string | null }) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Host", value: <Mono>{`${state.server.host}:${state.server.port}`}</Mono> },
    { label: "PID", value: <span className="font-bold tnum">{state.server.pid}</span> },
    { label: "Node", value: <Mono>{state.server.node}</Mono> },
    { label: "Build", value: <Mono>{state.server.srcHash}</Mono> },
    {
      label: "Admin auth",
      value: state.server.adminProtected ? (
        <span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-positive">
          <ShieldCheck className="size-3.5" /> protected
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-amber">
          <AlertTriangle className="size-3.5" /> localhost only
        </span>
      ),
    },
    {
      label: "Last request",
      value: state.stats.lastModel ? (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <Mono>{state.stats.lastModel}</Mono>
          {lastAgo ? <span className="text-[12px] text-muted-foreground">· {lastAgo} ago</span> : null}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    },
  ]
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-border-soft px-6 py-4">
        <span className="grid size-8 place-items-center rounded-[9px] bg-secondary text-forest">
          <Server className="size-4" />
        </span>
        <div className="text-[14px] font-extrabold tracking-[-0.02em]">Server</div>
        <span className="flex-1" />
        <Link
          href="/dashboard/models"
          className="inline-flex items-center gap-1 text-[12.5px] font-bold text-positive hover:underline"
        >
          Test models <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
      <dl className="px-6">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3 border-b border-border-soft py-3 last:border-0">
            <dt className="w-28 shrink-0 text-[12.5px] font-semibold text-muted-foreground">{r.label}</dt>
            <dd className="min-w-0 flex-1">{r.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[11.5px]">{children}</code>
  )
}
