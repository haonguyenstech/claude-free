"use client"

import { useEffect, useMemo, useState } from "react"
import { Play, Loader2, Check, X, Search, Zap, KeyRound, Boxes, Activity } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useDashboard } from "@/hooks/use-dashboard"
import { useToast } from "@/hooks/use-toast"
import {
  fmtAge,
  setModelEnabled,
  testModel,
  getHealth,
  setHealthConfig as apiSetHealthConfig,
  runHealthNow,
  type HealthConfig,
  type Model,
} from "@/lib/api"

type Result =
  | { status: "testing" }
  | { status: "ok"; ms: number; sample: string; ts?: number }
  | { status: "fail"; error: string; ms?: number; ts?: number }

// Persisted last-test (from the DB, via dashboard state) -> the same Result shape the UI renders.
function toResult(t: Model["lastTest"]): Result | undefined {
  if (!t) return undefined
  return t.ok
    ? { status: "ok", ms: t.ms ?? 0, sample: t.sample ?? "", ts: t.ts }
    : { status: "fail", error: t.error ?? "failed", ms: t.ms ?? undefined, ts: t.ts }
}

// Derive a per-model status from the persisted last-test. Live in-session results show in ResultView;
// this dot reflects the persisted/scheduled state, so it stays consistent across reloads.
function modelStatus(t: Model["lastTest"]): "healthy" | "down" | "unknown" {
  if (!t) return "unknown"
  return t.ok ? "healthy" : "down"
}

const GROUPS: { tier: string; label: string; variant: "on" | "env"; sub: string }[] = [
  { tier: "opencode", label: "OPENCODE", variant: "on", sub: "opencode.ai Zen · free, no key" },
  { tier: "mimo", label: "MIMO", variant: "on", sub: "Xiaomi · free, no key" },
  { tier: "anthropic", label: "ANTHROPIC", variant: "env", sub: "Claude models · via the local Claude CLI" },
  { tier: "gemini", label: "GEMINI", variant: "env", sub: "Google AI Studio · Gemini key" },
  { tier: "tokenrouter", label: "TOKENROUTER", variant: "env", sub: "API key" },
  { tier: "openrouter", label: "OPENROUTER", variant: "env", sub: "free models · OpenRouter key · auto-fallback on 429" },
]

export default function ModelsPage() {
  const { state, setState, refresh } = useDashboard()
  const toast = useToast()
  const [results, setResults] = useState<Record<string, Result>>({})
  const [toggling, setToggling] = useState<Record<string, boolean>>({})
  const [query, setQuery] = useState("")
  const [enabledOnly, setEnabledOnly] = useState(false)

  async function toggle(m: Model) {
    setToggling((t) => ({ ...t, [m.id]: true }))
    try {
      const s = await setModelEnabled(m.id, !m.enabled)
      setState(s)
      toast(m.enabled ? `disabled ${m.name}` : `enabled ${m.name}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : "failed to toggle")
    } finally {
      setToggling((t) => ({ ...t, [m.id]: false }))
    }
  }

  async function runOne(id: string) {
    setResults((r) => ({ ...r, [id]: { status: "testing" } }))
    try {
      const res = await testModel(id)
      const ts = Date.now()
      setResults((r) => ({
        ...r,
        [id]: res.ok
          ? { status: "ok", ms: res.ms ?? 0, sample: res.sample ?? "", ts }
          : { status: "fail", error: res.error ?? "failed", ms: res.ms, ts },
      }))
    } catch (e) {
      setResults((r) => ({
        ...r,
        [id]: { status: "fail", error: e instanceof Error ? e.message : "failed", ts: Date.now() },
      }))
    }
  }

  async function runMany(models: Model[], label: string) {
    for (const m of models) await runOne(m.id)
    toast(`tested ${label}`)
  }

  const q = query.trim().toLowerCase()
  const matches = (m: Model) =>
    (!enabledOnly || m.enabled) && (!q || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))

  // Live in-session result wins; otherwise fall back to the persisted last test from the DB.
  const shown = (m: Model): Result | undefined => results[m.id] ?? toResult(m.lastTest)

  const allModels = useMemo(() => GROUPS.flatMap((g) => state?.models[g.tier] ?? []), [state])
  const visible = allModels.filter(matches)
  const enabledCount = allModels.filter((m) => m.enabled).length
  const okCount = visible.filter((m) => shown(m)?.status === "ok").length
  const failCount = visible.filter((m) => shown(m)?.status === "fail").length

  if (!state) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <Card className="flex flex-wrap items-center gap-3 px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatPill icon={Boxes} tone="dark">
            {enabledCount}/{allModels.length} enabled
          </StatPill>
          {okCount > 0 ? (
            <StatPill icon={Check} tone="green">
              {okCount} ok
            </StatPill>
          ) : null}
          {failCount > 0 ? (
            <StatPill icon={X} tone="red">
              {failCount} failed
            </StatPill>
          ) : null}
        </div>

        <span className="flex-1" />

        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="filter models…"
            className="pl-9"
            aria-label="Filter models"
          />
        </div>

        <label className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-muted-foreground">
          <Switch checked={enabledOnly} onCheckedChange={setEnabledOnly} aria-label="Show enabled only" />
          Enabled only
        </label>

        <Button onClick={() => runMany(visible, "shown models")} disabled={!visible.length}>
          <Play className="size-4" />
          Test {q || enabledOnly ? "shown" : "every model"}
        </Button>
      </Card>

      <HealthCard onRefresh={refresh} />

      {GROUPS.map((g) => {
        const models = (state.models[g.tier] ?? []).filter(matches)
        if (!models.length) return null
        const groupEnabled = models.filter((m) => m.enabled).length
        return (
          <Card key={g.tier} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-border-soft px-6 py-4">
              <Badge variant={g.variant}>{g.label}</Badge>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[10.5px] font-bold",
                  g.variant === "on" ? "bg-mint-soft text-positive" : "bg-secondary text-forest",
                )}
              >
                {g.variant === "on" ? <Zap className="size-3" /> : <KeyRound className="size-3" />}
                {g.variant === "on" ? "free" : "keyed"}
              </span>
              <span className="text-[12.5px] text-muted-foreground">{g.sub}</span>
              <span className="flex-1" />
              <span className="text-[12px] font-semibold text-muted-foreground tnum">
                {groupEnabled}/{models.length} on
              </span>
              <Button variant="ghost" size="xs" onClick={() => runMany(models, g.tier)}>
                Test all
              </Button>
            </div>

            <ul className="px-6">
              {models.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-soft py-3 last:border-0"
                >
                  <Switch
                    checked={m.enabled}
                    disabled={toggling[m.id]}
                    onCheckedChange={() => toggle(m)}
                    aria-label={`${m.enabled ? "Disable" : "Enable"} ${m.name}`}
                  />
                  <div className={cn("min-w-[160px]", !m.enabled && "opacity-50")}>
                    <div className="flex items-center gap-2">
                      <StatusDot t={m.lastTest} />
                      <span className="font-bold tracking-[-0.01em]">{m.name}</span>
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">{m.id}</div>
                  </div>
                  <div className={cn("flex gap-1.5", !m.enabled && "opacity-50")}>
                    {m.ctx ? <Chip>{m.ctx}</Chip> : null}
                    {m.tps ? <Chip fast={m.tps >= 50}>{m.tps} tok/s</Chip> : <Chip>payg</Chip>}
                  </div>
                  {!m.enabled ? (
                    <span className="rounded-full bg-[#fdecea] px-2 py-0.5 text-[11px] font-bold text-destructive">
                      off
                    </span>
                  ) : null}
                  <div className="ml-auto min-w-[150px] text-right text-[12px]">
                    <ResultView r={shown(m)} />
                  </div>
                  <Button variant="ghost" size="xs" disabled={!m.enabled} onClick={() => runOne(m.id)}>
                    Test
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )
      })}

      {visible.length === 0 ? (
        <Card className="px-6 py-10 text-center text-[13px] text-muted-foreground">
          No models match <span className="font-mono text-foreground">{query}</span>
          {enabledOnly ? " among enabled models" : ""}.
        </Card>
      ) : null}
    </div>
  )
}

function StatPill({
  icon: Icon,
  tone,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  tone: "green" | "red" | "dark"
  children: React.ReactNode
}) {
  const cls = {
    green: "bg-mint-soft text-positive",
    red: "bg-[#fdecea] text-destructive",
    dark: "bg-secondary text-forest",
  }[tone]
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12.5px] font-bold tnum", cls)}>
      <Icon className="size-3.5" />
      {children}
    </span>
  )
}

function Chip({ children, fast }: { children: React.ReactNode; fast?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-[7px] border px-2 py-1 font-mono text-[11px]",
        fast
          ? "border-[rgba(11,169,104,0.25)] bg-mint-soft text-positive"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  )
}

function Ago({ ts }: { ts?: number }) {
  if (!ts) return null
  return <span className="text-[11px] text-muted-foreground">· {fmtAge(Math.floor((Date.now() - ts) / 1000))} ago</span>
}

function ResultView({ r }: { r?: Result }) {
  if (!r) return <span className="text-muted-foreground">—</span>
  if (r.status === "testing")
    return (
      <span className="inline-flex items-center gap-1.5 text-forest">
        <Loader2 className="size-3.5 animate-spin" /> testing…
      </span>
    )
  if (r.status === "ok")
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 font-bold text-positive">
          <Check className="size-3.5" /> ok
        </span>
        <span className="truncate text-muted-foreground" title={r.sample}>
          {r.ms}ms · &quot;{r.sample}&quot;
        </span>
        <Ago ts={r.ts} />
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 font-medium text-destructive" title={r.error}>
      <X className="size-3.5" />
      <span className="truncate">{r.error}</span>
      <Ago ts={r.ts} />
    </span>
  )
}

function StatusDot({ t }: { t: Model["lastTest"] }) {
  const status = modelStatus(t)
  const color = {
    healthy: "bg-positive",
    down: "bg-destructive",
    unknown: "bg-muted-foreground/40",
  }[status]
  let title = "never tested"
  if (t) {
    const age = `${fmtAge(Math.floor((Date.now() - t.ts) / 1000))} ago`
    title =
      status === "healthy"
        ? `healthy · ${t.ms ?? 0}ms · tested ${age}`
        : `down · ${t.status ? `HTTP ${t.status}` : t.error ?? "error"} · ${age}`
  }
  return (
    <span
      className={cn("size-2 shrink-0 rounded-full", color)}
      role="img"
      aria-label={`${status}: ${title}`}
      title={title}
    />
  )
}

const INTERVALS = [
  { value: 15, label: "every 15 min" },
  { value: 30, label: "every 30 min" },
  { value: 60, label: "every 1 hour" },
  { value: 120, label: "every 2 hours" },
  { value: 360, label: "every 6 hours" },
]

function HealthCard({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const toast = useToast()
  const [health, setHealth] = useState<HealthConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [runningNow, setRunningNow] = useState(false)

  useEffect(() => {
    let alive = true
    getHealth()
      .then((c) => {
        if (alive) setHealth(c)
      })
      .catch(() => {
        /* keep null; card shows loading */
      })
    return () => {
      alive = false
    }
  }, [])

  async function save(p: { enabled?: boolean; intervalMin?: number }) {
    setSaving(true)
    try {
      const c = await apiSetHealthConfig(p)
      setHealth(c)
    } catch (e) {
      toast(e instanceof Error ? e.message : "failed to update health checks")
    } finally {
      setSaving(false)
    }
  }

  async function runNow() {
    setRunningNow(true)
    try {
      const { config, result } = await runHealthNow()
      setHealth(config)
      toast(`checked ${result.checked} · ${result.ok} ok · ${result.failed} failed`)
      await onRefresh()
    } catch (e) {
      toast(e instanceof Error ? e.message : "failed to run health check")
    } finally {
      setRunningNow(false)
    }
  }

  const now = Date.now()

  return (
    <Card className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-4">
      <div className="flex items-center gap-2">
        <Activity className="size-4 text-forest" />
        <span className="text-[13px] font-bold tracking-[-0.01em]">Automatic health checks</span>
      </div>

      <span className="flex-1" />

      {!health ? (
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> loading…
        </span>
      ) : (
        <>
          <div className="flex-1 text-[12.5px] text-muted-foreground tnum">
            {!health.enabled ? (
              <span>off — models are only checked when you test them manually</span>
            ) : runningNow || health.running ? (
              <span className="inline-flex items-center gap-1.5 text-forest">
                <Loader2 className="size-3.5 animate-spin" /> running…
              </span>
            ) : (
              <span>
                {health.lastRunAt > 0
                  ? `last run ${fmtAge(Math.floor((now - health.lastRunAt) / 1000))} ago`
                  : "not run yet"}
                {health.nextRunAt > now
                  ? ` · next in ~${fmtAge(Math.floor((health.nextRunAt - now) / 1000))}`
                  : ""}
              </span>
            )}
          </div>

          <label className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-muted-foreground">
            <Switch
              checked={health.enabled}
              disabled={saving}
              onCheckedChange={(enabled) => save({ enabled })}
              aria-label="Enable automatic health checks"
            />
            Enabled
          </label>

          <Select
            value={String(health.intervalMin)}
            disabled={saving || !health.enabled}
            onValueChange={(v) => save({ intervalMin: Number(v) })}
          >
            <SelectTrigger className="w-[150px]" aria-label="Health check interval">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVALS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" disabled={runningNow} onClick={runNow}>
            {runningNow ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Run now
          </Button>
        </>
      )}
    </Card>
  )
}
