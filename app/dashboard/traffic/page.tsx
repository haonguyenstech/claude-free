"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ArrowDownUp,
  CheckCircle2,
  Gauge,
  ArrowDownToLine,
  ArrowUpFromLine,
  Activity,
  Server,
  Boxes,
  Timer,
  KeyRound,
  CalendarRange,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtAge, getTraffic, type TrafficData } from "@/lib/api"

const POLL_MS = 5000

// Map internal backend ids (as logged in request_logs) to the friendly names the rest of the
// dashboard uses. `zen` is the opencode.ai Zen endpoint — shown as "OpenCode" everywhere else.
const BACKEND_LABELS: Record<string, string> = {
  zen: "OpenCode",
  mimo: "MiMo",
  anthropic: "Anthropic",
  gemini: "Gemini",
  tokenrouter: "TokenRouter",
  openrouter: "OpenRouter",
  cli: "Claude CLI",
}
const backendLabel = (id: string) => BACKEND_LABELS[id] ?? id

function useTraffic() {
  const [data, setData] = useState<TrafficData | null>(null)
  const timer = useRef<number | null>(null)
  const load = useCallback(async () => {
    try {
      setData(await getTraffic())
    } catch {
      /* keep last good snapshot */
    }
  }, [])
  useEffect(() => {
    load()
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      load()
    }
    timer.current = window.setInterval(tick, POLL_MS)
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") load()
    }
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible)
    return () => {
      if (timer.current) window.clearInterval(timer.current)
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible)
    }
  }, [load])
  return data
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return `${n}`
}

function fmtLatency(ms: number): string {
  if (!ms) return "—"
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)}s`
  return `${ms}ms`
}

// Countdown to a reset timestamp, e.g. "in 4m", "in 2h", or "now" once it's passed.
function fmtUntil(t: number): string {
  const sec = Math.floor((t - Date.now()) / 1000)
  if (sec <= 0) return "now"
  if (sec < 60) return `in ${sec}s`
  if (sec < 3600) return `in ${Math.floor(sec / 60)}m`
  if (sec < 86400) return `in ${Math.floor(sec / 3600)}h`
  return `in ${Math.floor(sec / 86400)}d`
}

export default function TrafficPage() {
  const data = useTraffic()

  if (!data) {
    return (
      <div className="flex flex-col gap-[18px]">
        <div className="grid grid-cols-2 gap-[18px] xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-[var(--radius-md)]" />
          ))}
        </div>
        <Skeleton className="h-56 rounded-[var(--radius-xl)]" />
        <Skeleton className="h-64 rounded-[var(--radius-xl)]" />
      </div>
    )
  }

  const { totals } = data
  const empty = totals.total === 0

  if (empty) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="grid size-12 place-items-center rounded-[14px] bg-mint-soft text-positive">
          <Activity className="size-6" />
        </span>
        <div className="text-[15px] font-extrabold tracking-[-0.02em]">No traffic yet</div>
        <p className="max-w-sm text-[13px] text-muted-foreground">
          Point Claude Code at this proxy and pick a model. Requests will stream in here in real time.
        </p>
      </Card>
    )
  }

  const stats: { label: string; value: string | number; icon: LucideIcon; tone: Tone; sub?: string }[] = [
    { label: "Requests", value: fmtNum(totals.total), icon: ArrowDownUp, tone: "dark" },
    {
      label: "Success rate",
      value: `${totals.successRate}%`,
      icon: CheckCircle2,
      tone: totals.successRate >= 99 ? "green" : totals.successRate >= 90 ? "amber" : "red",
      sub: `${totals.errors} error${totals.errors === 1 ? "" : "s"}`,
    },
    { label: "Avg latency", value: fmtLatency(totals.avgLatencyMs), icon: Gauge, tone: "dark" },
    { label: "Tokens in", value: fmtNum(totals.inputTokens), icon: ArrowDownToLine, tone: "dark" },
    { label: "Tokens out", value: fmtNum(totals.outputTokens), icon: ArrowUpFromLine, tone: "green" },
  ]

  return (
    <div className="flex flex-col gap-[18px]">
      <section className="grid grid-cols-2 gap-[18px] sm:grid-cols-3 xl:grid-cols-5">
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
              <div className="mt-3 text-[26px] font-extrabold tracking-[-0.04em] tnum">{s.value}</div>
              {s.sub ? <div className="mt-0.5 text-[11.5px] font-medium text-muted-foreground">{s.sub}</div> : null}
            </Card>
          )
        })}
      </section>

      <ActivityChart series={data.series} />

      {data.rateLimits.length > 0 ? <RateLimitCard rows={data.rateLimits} /> : null}

      <div className="grid gap-[18px] lg:grid-cols-2">
        <Breakdown
          title="By backend"
          icon={Server}
          rows={data.byBackend.map((b) => ({ label: backendLabel(b.backend), count: b.count, errors: b.errors }))}
        />
        <ModelPerfCard rows={data.byModel} />
      </div>

      <DailyRollup daily={data.daily} />

      {data.byToken.length > 0 ? <TokenUsageCard rows={data.byToken} /> : null}

      <RecentTable rows={data.recent} />
    </div>
  )
}

type Tone = "green" | "red" | "amber" | "dark"
const toneCls: Record<Tone, string> = {
  green: "bg-mint-soft text-positive",
  red: "bg-[#fdecea] text-destructive",
  amber: "bg-[#fff4e2] text-amber",
  dark: "bg-secondary text-forest",
}

function ActivityChart({ series }: { series: TrafficData["series"] }) {
  const max = Math.max(1, ...series.map((s) => s.count))
  const total = series.reduce((n, s) => n + s.count, 0)
  return (
    <Card className="px-6 py-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-[9px] bg-secondary text-forest">
          <Activity className="size-4" />
        </span>
        <div>
          <div className="text-[14px] font-extrabold tracking-[-0.02em]">Activity</div>
          <div className="text-[11.5px] font-medium text-muted-foreground">
            Last 24 hours · {fmtNum(total)} request{total === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      <div className="flex h-32 items-end gap-[3px]">
        {series.map((s) => {
          const ok = s.count - s.errors
          const h = (s.count / max) * 100
          const errFrac = s.count ? s.errors / s.count : 0
          return (
            <div key={s.t} className="group relative flex flex-1 items-end" style={{ height: "100%" }}>
              <div
                className="w-full overflow-hidden rounded-[3px] bg-muted transition-colors group-hover:bg-secondary"
                style={{ height: `${Math.max(h, s.count ? 4 : 2)}%` }}
              >
                {s.errors > 0 && (
                  <div className="w-full bg-destructive/70" style={{ height: `${errFrac * 100}%` }} />
                )}
                <div
                  className="w-full bg-gradient-to-t from-mint-strong to-mint"
                  style={{ height: `${(1 - errFrac) * 100}%` }}
                />
              </div>
              <div className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-forest px-2 py-1 text-[11px] font-semibold text-[#eaf4ee] group-hover:block">
                {s.count} req{s.errors ? ` · ${s.errors} err` : ""}
                <span className="block text-center text-[10px] font-normal text-[#9fc5b4]">{hourLabel(s.t)}</span>
              </div>
              <span className="sr-only">
                {hourLabel(s.t)}: {ok} ok, {s.errors} errors
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10.5px] font-medium text-muted-foreground tnum">
        <span>-24h</span>
        <span>-12h</span>
        <span>now</span>
      </div>
    </Card>
  )
}

function hourLabel(t: number): string {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, "0")}:00`
}

function Breakdown({
  title,
  icon: Icon,
  rows,
  mono,
}: {
  title: string
  icon: LucideIcon
  rows: { label: string; count: number; errors?: number }[]
  mono?: boolean
}) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <Card className="px-6 py-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-[9px] bg-secondary text-forest">
          <Icon className="size-4" />
        </span>
        <div className="text-[14px] font-extrabold tracking-[-0.02em]">{title}</div>
      </div>
      {rows.length === 0 ? (
        <div className="py-4 text-[13px] text-muted-foreground">No data.</div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-3">
              <span
                className={cn(
                  "w-32 shrink-0 truncate text-[13px] font-bold tracking-[-0.01em]",
                  mono ? "font-mono text-[11.5px]" : "capitalize",
                )}
                title={r.label}
              >
                {r.label}
              </span>
              <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-mint-strong to-mint"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </span>
              {r.errors ? (
                <span className="text-[11px] font-bold text-destructive tnum">{r.errors} err</span>
              ) : null}
              <span className="w-12 text-right text-[13px] font-extrabold tnum">{fmtNum(r.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// Per-model speed from live traffic: request count, average TTFT, and decode throughput (tok/s).
function ModelPerfCard({ rows }: { rows: TrafficData["byModel"] }) {
  return (
    <Card className="px-6 py-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-[9px] bg-secondary text-forest">
          <Boxes className="size-4" />
        </span>
        <div className="text-[14px] font-extrabold tracking-[-0.02em]">By model</div>
        <span className="text-[12px] text-muted-foreground">· measured speed</span>
      </div>
      {rows.length === 0 ? (
        <div className="py-4 text-[13px] text-muted-foreground">No data.</div>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[10.5px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
              <th className="pb-2 font-bold">Model</th>
              <th className="pb-2 text-right font-bold">Req</th>
              <th className="pb-2 text-right font-bold">TTFT</th>
              <th className="pb-2 text-right font-bold">tok/s</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.model} className="border-t border-border-soft">
                <td className="truncate py-2 font-mono text-[11.5px]" title={m.model}>
                  {m.model}
                </td>
                <td className="py-2 text-right font-extrabold tnum">{fmtNum(m.count)}</td>
                <td className="py-2 text-right text-muted-foreground tnum">
                  {m.avgTtftMs != null ? fmtLatency(m.avgTtftMs) : "—"}
                </td>
                <td className="py-2 text-right font-bold text-positive tnum">
                  {m.tokPerSec != null ? m.tokPerSec.toFixed(1) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

// Live rate-limit snapshots parsed from the Anthropic `anthropic-ratelimit-*` / `retry-after` headers.
// Surfaces remaining quota + reset countdown for the CLI/Anthropic models — the 429-prone ones.
function RateLimitCard({ rows }: { rows: TrafficData["rateLimits"] }) {
  return (
    <Card className="px-6 py-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-[9px] bg-[#fff4e2] text-amber">
          <Timer className="size-4" />
        </span>
        <div>
          <div className="text-[14px] font-extrabold tracking-[-0.02em]">Rate limits</div>
          <div className="text-[11.5px] font-medium text-muted-foreground">
            Latest quota reported by Anthropic per model
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[13px]">
          <thead>
            <tr className="text-left text-[10.5px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
              <th className="pb-2 font-bold">Model</th>
              <th className="pb-2 text-right font-bold">Requests left</th>
              <th className="pb-2 text-right font-bold">Tokens left</th>
              <th className="pb-2 text-right font-bold">Resets</th>
              <th className="pb-2 text-right font-bold">Last</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const limited = r.status === 429 || (r.requestsRemaining === 0)
              return (
                <tr key={r.modelId} className="border-t border-border-soft">
                  <td className="truncate py-2 font-mono text-[11.5px]" title={r.modelId}>
                    {r.modelId}
                    {limited ? (
                      <span className="ml-1.5 rounded-[6px] bg-[#fdecea] px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                        429
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 text-right tnum">
                    {r.requestsRemaining != null
                      ? `${fmtNum(r.requestsRemaining)}${r.requestsLimit ? ` / ${fmtNum(r.requestsLimit)}` : ""}`
                      : "—"}
                  </td>
                  <td className="py-2 text-right tnum">
                    {r.tokensRemaining != null
                      ? `${fmtNum(r.tokensRemaining)}${r.tokensLimit ? ` / ${fmtNum(r.tokensLimit)}` : ""}`
                      : "—"}
                  </td>
                  <td className="py-2 text-right font-medium tnum">
                    {r.resetAt ? fmtUntil(r.resetAt) : "—"}
                  </td>
                  <td className="py-2 text-right text-muted-foreground tnum">
                    {fmtAge(Math.max(0, Math.floor((Date.now() - r.ts) / 1000)))} ago
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// 14-day token-volume rollup — a sense of scale for how much the proxy is moving over time.
function DailyRollup({ daily }: { daily: TrafficData["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.inputTokens + d.outputTokens))
  const totalTok = daily.reduce((n, d) => n + d.inputTokens + d.outputTokens, 0)
  return (
    <Card className="px-6 py-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-[9px] bg-secondary text-forest">
          <CalendarRange className="size-4" />
        </span>
        <div>
          <div className="text-[14px] font-extrabold tracking-[-0.02em]">Token volume</div>
          <div className="text-[11.5px] font-medium text-muted-foreground">
            Last 14 days · {fmtNum(totalTok)} tokens
          </div>
        </div>
      </div>
      <div className="flex h-28 items-end gap-1.5">
        {daily.map((d) => {
          const tok = d.inputTokens + d.outputTokens
          const h = (tok / max) * 100
          return (
            <div key={d.t} className="group relative flex flex-1 items-end" style={{ height: "100%" }}>
              <div
                className="w-full rounded-[3px] bg-gradient-to-t from-mint-strong to-mint transition-colors"
                style={{ height: `${Math.max(h, tok ? 4 : 2)}%` }}
              />
              <div className="pointer-events-none absolute -top-10 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-forest px-2 py-1 text-[11px] font-semibold text-[#eaf4ee] group-hover:block">
                {fmtNum(tok)} tok · {d.count} req
                <span className="block text-center text-[10px] font-normal text-[#9fc5b4]">{dayLabel(d.t)}</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10.5px] font-medium text-muted-foreground tnum">
        <span>-14d</span>
        <span>-7d</span>
        <span>today</span>
      </div>
    </Card>
  )
}

function dayLabel(t: number): string {
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// Per-token (per-user) usage — who is consuming the shared backend quota.
function TokenUsageCard({ rows }: { rows: TrafficData["byToken"] }) {
  const now = Date.now()
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-border-soft px-6 py-4">
        <span className="grid size-8 place-items-center rounded-[9px] bg-secondary text-forest">
          <KeyRound className="size-4" />
        </span>
        <div className="text-[14px] font-extrabold tracking-[-0.02em]">By API key</div>
        <span className="text-[12px] text-muted-foreground">· top {rows.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
              <th className="px-6 py-2.5 font-bold">Key</th>
              <th className="py-2.5 text-right font-bold">Requests</th>
              <th className="py-2.5 text-right font-bold">Errors</th>
              <th className="py-2.5 text-right font-bold">In</th>
              <th className="py-2.5 text-right font-bold">Out</th>
              <th className="px-6 py-2.5 text-right font-bold">Last used</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.masked} className="border-t border-border-soft">
                <td className="px-6 py-2.5">
                  <span className="font-semibold">{r.label || "unnamed"}</span>
                  <code className="ml-2 font-mono text-[11px] text-muted-foreground">{r.masked}</code>
                </td>
                <td className="py-2.5 text-right font-extrabold tnum">{fmtNum(r.count)}</td>
                <td className="py-2.5 text-right tnum">
                  {r.errors ? <span className="font-bold text-destructive">{fmtNum(r.errors)}</span> : "—"}
                </td>
                <td className="py-2.5 text-right text-muted-foreground tnum">{fmtNum(r.inputTokens)}</td>
                <td className="py-2.5 text-right text-muted-foreground tnum">{fmtNum(r.outputTokens)}</td>
                <td className="px-6 py-2.5 text-right text-muted-foreground tnum">
                  {r.lastAt ? `${fmtAge(Math.max(0, Math.floor((now - r.lastAt) / 1000)))} ago` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function RecentTable({ rows }: { rows: TrafficData["recent"] }) {
  const now = Date.now()
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-border-soft px-6 py-4">
        <span className="grid size-8 place-items-center rounded-[9px] bg-secondary text-forest">
          <ArrowDownUp className="size-4" />
        </span>
        <div className="text-[14px] font-extrabold tracking-[-0.02em]">Recent requests</div>
        <span className="text-[12px] text-muted-foreground">· last {rows.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
              <th className="px-6 py-2.5 font-bold">When</th>
              <th className="py-2.5 font-bold">Model</th>
              <th className="py-2.5 font-bold">Backend</th>
              <th className="py-2.5 font-bold">Status</th>
              <th className="py-2.5 text-right font-bold">TTFT</th>
              <th className="py-2.5 text-right font-bold">Latency</th>
              <th className="py-2.5 text-right font-bold">In</th>
              <th className="px-6 py-2.5 text-right font-bold">Out</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const ok = r.status > 0 && r.status < 400
              return (
                <tr key={i} className="border-t border-border-soft">
                  <td className="whitespace-nowrap px-6 py-2.5 text-muted-foreground tnum">
                    {fmtAge(Math.floor((now - r.ts) / 1000))} ago
                  </td>
                  <td className="py-2.5 font-mono text-[11.5px]">{r.model || "—"}</td>
                  <td className="py-2.5 font-medium">{r.backend ? backendLabel(r.backend) : "—"}</td>
                  <td className="py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-[6px] px-1.5 py-0.5 text-[11px] font-bold tnum",
                        ok ? "bg-mint-soft text-positive" : "bg-[#fdecea] text-destructive",
                      )}
                    >
                      {r.status || "—"}
                    </span>
                    {r.stream ? (
                      <span className="ml-1.5 rounded-[6px] bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-forest">
                        stream
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2.5 text-right text-muted-foreground tnum">
                    {r.ttftMs ? fmtLatency(r.ttftMs) : "—"}
                  </td>
                  <td className="py-2.5 text-right tnum">{fmtLatency(r.latencyMs)}</td>
                  <td className="py-2.5 text-right text-muted-foreground tnum">{r.inputTokens || "—"}</td>
                  <td className="px-6 py-2.5 text-right text-muted-foreground tnum">{r.outputTokens || "—"}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
