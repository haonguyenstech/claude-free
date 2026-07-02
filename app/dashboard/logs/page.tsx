"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { RefreshCw, ScrollText, ChevronLeft, ChevronRight, Download } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fmtAge, downloadLogsCsv } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

const POLL_MS = 5000
const PAGE_SIZE = 50
const PW_KEY = "cf_admin_pw"
// Radix Select forbids an empty-string item value, so "all models / all backends" uses a sentinel.
const ALL = "__all__"

// Map internal backend ids (as logged in request_logs) to the friendly names used across the
// dashboard. `zen` is the opencode.ai Zen endpoint — shown as "OpenCode" everywhere else.
const BACKEND_LABELS: Record<string, string> = {
  zen: "OpenCode",
  clinepass: "ClinePass",
}
const backendLabel = (id: string) => BACKEND_LABELS[id] ?? id

type StatusFilter = "all" | "ok" | "error"

type LogRow = {
  id: number
  ts: number
  model: string
  backend: string
  status: number
  latencyMs: number
  ttftMs: number
  inputTokens: number
  outputTokens: number
  stream: boolean
}

type LogsResult = {
  rows: LogRow[]
  total: number
  hasMore: boolean
  facets: { models: string[]; backends: string[] }
}

type Filters = {
  model: string
  backend: string
  status: StatusFilter
  range: "1h" | "24h" | "7d" | "all"
}

const RANGE_HOURS: Record<Filters["range"], number | undefined> = {
  "1h": 1,
  "24h": 24,
  "7d": 168,
  all: undefined,
}

async function fetchLogs(url: string): Promise<LogsResult> {
  const headers: Record<string, string> = {}
  const pw = typeof localStorage !== "undefined" ? localStorage.getItem(PW_KEY) : null
  if (pw) headers["x-admin-password"] = pw
  const res = await fetch(url, { headers })
  if (res.status === 401) throw new Error("Unauthorized — admin password required.")
  if (!res.ok) throw new Error(`Request failed (HTTP ${res.status})`)
  return res.json() as Promise<LogsResult>
}

// Filter params shared by the paged query and the CSV export (export adds no limit/offset).
function filterParams(filters: Filters): URLSearchParams {
  const p = new URLSearchParams()
  p.set("status", filters.status)
  if (filters.model) p.set("model", filters.model)
  if (filters.backend) p.set("backend", filters.backend)
  const h = RANGE_HOURS[filters.range]
  if (h !== undefined) p.set("sinceHours", String(h))
  return p
}

function buildUrl(filters: Filters, offset: number): string {
  const p = filterParams(filters)
  p.set("limit", String(PAGE_SIZE))
  p.set("offset", String(offset))
  return `/dashboard/api/logs?${p.toString()}`
}

function fmtLatency(ms: number): string {
  if (!ms) return "—"
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)}s`
  return `${ms}ms`
}

export default function LogsPage() {
  const toast = useToast()
  const [filters, setFilters] = useState<Filters>({ model: "", backend: "", status: "all", range: "24h" })
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState<LogsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const filtersRef = useRef(filters)
  const offsetRef = useRef(offset)
  filtersRef.current = filters
  offsetRef.current = offset

  const load = useCallback(async () => {
    try {
      const res = await fetchLogs(buildUrl(filtersRef.current, offsetRef.current))
      setData(res)
    } catch {
      /* keep last good snapshot */
    } finally {
      setLoading(false)
    }
  }, [])

  // Reload when filters or page change.
  useEffect(() => {
    setLoading(true)
    load()
  }, [filters, offset, load])

  // Auto-refresh, but skip while the tab is hidden.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return
      load()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [load])

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setOffset(0)
    setFilters((f) => ({ ...f, [key]: value }))
  }

  async function onExport() {
    setExporting(true)
    try {
      await downloadLogsCsv(filterParams(filters))
      toast("Exported the current view to CSV")
    } catch (e) {
      toast(e instanceof Error ? e.message : "export failed")
    } finally {
      setExporting(false)
    }
  }

  const facets = data?.facets ?? { models: [], backends: [] }
  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const hasMore = data?.hasMore ?? false
  const now = Date.now()
  const pageStart = total === 0 ? 0 : offset + 1
  const pageEnd = offset + rows.length

  return (
    <div className="flex flex-col gap-[18px]">
      <Card className="flex flex-wrap items-center gap-2.5 px-[18px] py-3.5">
        <Select
          value={filters.model || ALL}
          onValueChange={(v) => setFilter("model", v === ALL ? "" : v)}
        >
          <SelectTrigger aria-label="Model" className="min-w-[150px]">
            <SelectValue placeholder="All models" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All models</SelectItem>
            {facets.models.map((m) => (
              <SelectItem key={m} value={m} className="font-mono text-[12px]">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.backend || ALL}
          onValueChange={(v) => setFilter("backend", v === ALL ? "" : v)}
        >
          <SelectTrigger aria-label="Backend" className="min-w-[140px]">
            <SelectValue placeholder="All backends" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All backends</SelectItem>
            {facets.backends.map((b) => (
              <SelectItem key={b} value={b}>
                {backendLabel(b)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.status} onValueChange={(v) => setFilter("status", v as StatusFilter)}>
          <SelectTrigger aria-label="Status" className="min-w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
            <SelectItem value="error">Errors</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.range} onValueChange={(v) => setFilter("range", v as Filters["range"])}>
          <SelectTrigger aria-label="Time range" className="min-w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">Last 1h</SelectItem>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7d</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>

        <span className="flex-1" />

        <span className="text-[12.5px] font-medium text-muted-foreground tnum">
          {total.toLocaleString()} request{total === 1 ? "" : "s"}
        </span>

        <Button
          variant="outline"
          size="default"
          onClick={onExport}
          disabled={exporting || total === 0}
          aria-label="Export CSV"
        >
          <Download className="size-4" />
          Export
        </Button>

        <Button variant="outline" size="default" onClick={() => load()} aria-label="Refresh">
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-border-soft px-6 py-4">
          <span className="grid size-8 place-items-center rounded-[9px] bg-secondary text-forest">
            <ScrollText className="size-4" />
          </span>
          <div className="text-[14px] font-extrabold tracking-[-0.02em]">Request log</div>
          {total > 0 ? (
            <span className="text-[12px] text-muted-foreground tnum">
              · {pageStart.toLocaleString()}–{pageEnd.toLocaleString()} of {total.toLocaleString()}
            </span>
          ) : null}
        </div>

        {loading && !data ? (
          <div className="flex flex-col gap-2 p-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-9 rounded-[var(--radius-md)]" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="grid size-12 place-items-center rounded-[14px] bg-secondary text-forest">
              <ScrollText className="size-6" />
            </span>
            <div className="text-[15px] font-extrabold tracking-[-0.02em]">No matching requests</div>
            <p className="max-w-sm text-[13px] text-muted-foreground">
              Nothing matches these filters yet. Try widening the time range or clearing a filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
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
                {rows.map((r) => {
                  const ok = r.status >= 200 && r.status < 400
                  return (
                    <tr key={r.id} className="border-t border-border-soft transition-colors hover:bg-muted/60">
                      <td className="whitespace-nowrap px-6 py-2.5 text-muted-foreground tnum">
                        {fmtAge(Math.floor((now - r.ts) / 1000))} ago
                      </td>
                      <td className="py-2.5 font-mono text-[11.5px]">{r.model || "—"}</td>
                      <td className="py-2.5 font-medium">{r.backend ? backendLabel(r.backend) : "—"}</td>
                      <td className="py-2.5">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-[6px] px-1.5 py-0.5 text-[11px] font-bold tnum",
                            ok ? "bg-[#E6F4EA] text-positive" : "bg-[#FCE8E6] text-destructive",
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
        )}

        {rows.length > 0 ? (
          <div className="flex items-center gap-3 border-t border-border-soft px-6 py-3.5">
            <span className="text-[12.5px] font-medium text-muted-foreground tnum">
              {pageStart.toLocaleString()}–{pageEnd.toLocaleString()} of {total.toLocaleString()}
            </span>
            <span className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            >
              <ChevronLeft className="size-4" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasMore}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  )
}
