"use client"

import { useState } from "react"
import { KeyRound, ExternalLink, AlertTriangle, Check, X, Pencil, Plus, Trash2, ShieldCheck } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useDashboard } from "@/hooks/use-dashboard"
import { useToast } from "@/hooks/use-toast"
import { setBackendKey, type DashboardState } from "@/lib/api"

type Backend = DashboardState["backends"][number]

function BackendRow({
  b,
  busy,
  onSave,
  onClear,
}: {
  b: Backend
  busy: boolean
  onSave: (id: string, value: string) => Promise<void>
  onClear: (id: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")

  const status = b.fromEnv ? "env" : b.set ? "on" : "off"

  async function commit() {
    if (!draft.trim()) return
    await onSave(b.id, draft.trim())
    setDraft("")
    setOpen(false)
  }
  function cancel() {
    setDraft("")
    setOpen(false)
  }

  return (
    <li className="border-b border-border-soft px-6 py-4 transition-colors last:border-0 hover:bg-muted/40">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-[11px]",
            b.set || b.fromEnv ? "bg-[#E6F4EA] text-positive" : "bg-secondary text-muted-foreground",
          )}
        >
          <KeyRound className="size-5" />
        </span>

        <div className="min-w-[200px] flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-bold tracking-[-0.01em]">{b.label}</span>
            {status === "env" ? (
              <Badge variant="env" className="gap-1">
                <AlertTriangle className="size-3" /> env
              </Badge>
            ) : status === "on" ? (
              <Badge variant="on">set</Badge>
            ) : (
              <Badge variant="off">not set</Badge>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted-foreground">
            <span>{b.hint}</span>
            {b.set || b.fromEnv ? (
              <>
                <span aria-hidden>·</span>
                <code className="font-mono text-[11.5px] text-foreground/80">{b.masked}</code>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {b.link ? (
            <a
              href={b.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-bold text-mint transition-colors hover:bg-accent"
            >
              {b.linkLabel ?? "get key"} <ExternalLink className="size-3.5" />
            </a>
          ) : null}
          {b.fromEnv ? (
            <span className="text-[11.5px] font-semibold text-muted-foreground">managed by env var</span>
          ) : open ? null : (
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              {b.set ? <Pencil className="size-3.5" /> : <Plus className="size-3.5" />}
              {b.set ? "Update" : "Set key"}
            </Button>
          )}
        </div>
      </div>

      {open && !b.fromEnv ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            autoFocus
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commit()
              if (e.key === "Escape") cancel()
            }}
            placeholder={`Paste ${b.label}`}
            className="flex-1"
          />
          <div className="flex gap-2">
            <Button onClick={() => void commit()} disabled={busy || !draft.trim()}>
              <Check className="size-4" />
              {busy ? "Saving…" : "Save"}
            </Button>
            {b.set ? (
              <Button variant="danger" onClick={() => void onClear(b.id)} disabled={busy}>
                <Trash2 className="size-4" />
                Clear
              </Button>
            ) : null}
            <Button variant="ghost" size="icon" onClick={cancel} disabled={busy} aria-label="Cancel">
              <X className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

export default function CredentialsPage() {
  const { state, setState } = useDashboard()
  const toast = useToast()
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  async function save(id: string, value: string) {
    setBusy((s) => ({ ...s, [id]: true }))
    try {
      setState(await setBackendKey(id, value))
      toast(`Saved ${id} key`)
    } catch (e) {
      toast(e instanceof Error ? e.message : "failed to save key")
    } finally {
      setBusy((s) => ({ ...s, [id]: false }))
    }
  }

  async function clear(id: string) {
    setBusy((s) => ({ ...s, [id]: true }))
    try {
      setState(await setBackendKey(id, ""))
      toast(`Cleared ${id} key`)
    } catch (e) {
      toast(e instanceof Error ? e.message : "failed to clear key")
    } finally {
      setBusy((s) => ({ ...s, [id]: false }))
    }
  }

  if (!state) {
    return (
      <div className="flex flex-col gap-[18px]">
        <Skeleton className="h-[78px] rounded-[var(--radius-xl)]" />
        <Skeleton className="h-[360px] rounded-[var(--radius-xl)]" />
      </div>
    )
  }

  const backends = state.backends
  const configured = backends.filter((b) => b.set || b.fromEnv).length

  return (
    <div className="flex flex-col gap-[18px]">
      <Card className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-4">
        <span className="grid size-10 place-items-center rounded-[11px] bg-secondary text-forest">
          <ShieldCheck className="size-5" />
        </span>
        <div className="min-w-[160px]">
          <div className="flex items-center gap-2 text-[14px] font-extrabold tracking-[-0.02em]">
            Backend keys
            <Badge variant={configured ? "on" : "neutral"}>
              {configured}/{backends.length} configured
            </Badge>
          </div>
          <div className="text-[12.5px] font-medium text-muted-foreground">
            Upstream provider credentials the proxy uses to reach each backend
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-border-soft px-6 py-4">
          <span className="grid size-8 place-items-center rounded-[9px] bg-secondary text-forest">
            <KeyRound className="size-4" />
          </span>
          <div className="text-[14px] font-extrabold tracking-[-0.02em]">Providers</div>
          <span className="text-[12px] text-muted-foreground">· env vars override stored keys</span>
        </div>
        <ul>
          {backends.map((b) => (
            <BackendRow key={b.id} b={b} busy={!!busy[b.id]} onSave={save} onClear={clear} />
          ))}
        </ul>
      </Card>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Keys are stored in the server database and used only to reach the upstream provider. A matching environment
        variable (e.g. <code className="font-mono">CLINEPASS_KEY</code>) always takes precedence and locks the field.
      </p>
    </div>
  )
}
