"use client"

import { useState } from "react"
import { Check, Clock, Copy, Eye, EyeOff, KeyRound, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useDashboard } from "@/hooks/use-dashboard"
import { useToast } from "@/hooks/use-toast"
import { removeToken, generateToken, setTokenLabel, setTokenExpiry, fmtAge, type DashboardState } from "@/lib/api"

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement("textarea")
    ta.value = text
    ta.style.position = "fixed"
    ta.style.opacity = "0"
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

type Token = DashboardState["gate"]["tokens"][number]

function usageLine(t: Token): string {
  const reqs = `${t.requestCount} ${t.requestCount === 1 ? "request" : "requests"}`
  if (!t.lastUsedAt) return `${reqs} · never used`
  const ageSec = Math.max(0, Math.floor((Date.now() - t.lastUsedAt) / 1000))
  return `${reqs} · last used ${fmtAge(ageSec)} ago`
}

// Expiry presets offered when editing a key's lifetime. `null` = never expires.
const EXPIRY_PRESETS: { label: string; days: number | null }[] = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
  { label: "Never", days: null },
]

type ExpiryState = { text: string; expired: boolean; soon: boolean }
function expiryState(t: Token): ExpiryState {
  if (!t.expiresAt) return { text: "no expiry", expired: false, soon: false }
  const sec = Math.floor((t.expiresAt - Date.now()) / 1000)
  if (sec <= 0) return { text: "expired", expired: true, soon: false }
  return { text: `expires in ${fmtAge(sec)}`, expired: false, soon: sec < 3 * 86400 }
}

function IconButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-8 place-items-center rounded-lg transition-all duration-200 active:scale-[0.94]",
        danger
          ? "text-destructive hover:bg-[#FCE8E6]"
          : "text-muted-foreground hover:bg-secondary hover:text-forest",
      )}
    >
      {children}
    </button>
  )
}

function KeyRow({
  t,
  copied,
  onCopy,
  onRemove,
  onSaveLabel,
  onSaveExpiry,
}: {
  t: Token
  copied: boolean
  onCopy: (v: string) => void
  onRemove: (v: string) => void
  onSaveLabel: (token: string, label: string) => Promise<void>
  onSaveExpiry: (token: string, expiresAt: number | null) => Promise<void>
}) {
  const [reveal, setReveal] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(t.label ?? "")
  const [saving, setSaving] = useState(false)
  const [expiryOpen, setExpiryOpen] = useState(false)
  const [savingExpiry, setSavingExpiry] = useState(false)
  const exp = expiryState(t)

  async function applyExpiry(days: number | null) {
    setSavingExpiry(true)
    try {
      await onSaveExpiry(t.value, days == null ? null : Date.now() + days * 86400000)
      setExpiryOpen(false)
    } finally {
      setSavingExpiry(false)
    }
  }

  function startEdit() {
    setDraft(t.label ?? "")
    setEditing(true)
  }
  function cancelEdit() {
    setEditing(false)
    setDraft(t.label ?? "")
  }
  async function save() {
    setSaving(true)
    try {
      await onSaveLabel(t.value, draft.trim())
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-border-soft px-6 py-4 transition-colors last:border-0 hover:bg-muted/50">
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-[11px]",
          exp.expired ? "bg-[#FCE8E6] text-destructive" : "bg-[#E6F4EA] text-positive",
        )}
      >
        <KeyRound className="size-5" />
      </span>

      <div className="min-w-[220px] flex-1">
        {editing ? (
          <div className="flex max-w-[320px] items-center gap-1.5">
            <Input
              autoFocus
              value={draft}
              maxLength={40}
              placeholder="Label this key"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save()
                if (e.key === "Escape") cancelEdit()
              }}
              className="h-7 flex-1 px-2 text-[12.5px]"
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              aria-label="Save label"
              title="Save"
              className="grid size-7 place-items-center rounded-lg text-positive hover:bg-secondary disabled:opacity-50"
            >
              <Check className="size-4" />
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              aria-label="Cancel"
              title="Cancel"
              className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-50"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "truncate text-[13.5px] font-bold tracking-[-0.01em]",
                t.label ? "text-foreground" : "italic font-medium text-muted-foreground",
              )}
            >
              {t.label || "unnamed"}
            </span>
            {exp.expired ? (
              <span className="rounded-[6px] bg-[#FCE8E6] px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                expired
              </span>
            ) : null}
            <button
              type="button"
              onClick={startEdit}
              aria-label="Edit label"
              title="Rename"
              className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-70 transition-colors hover:bg-secondary hover:text-forest hover:opacity-100"
            >
              <Pencil className="size-3.5" />
            </button>
          </div>
        )}
        <code className="mt-0.5 block truncate font-mono text-[11.5px] text-muted-foreground">
          {reveal ? t.value : t.masked}
        </code>
      </div>

      <div className="flex min-w-[190px] flex-col gap-1">
        <span className="tnum text-[12px] font-medium text-muted-foreground">{usageLine(t)}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setExpiryOpen((o) => !o)}
            title="Set expiry"
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold transition-colors hover:bg-secondary",
              exp.expired ? "text-destructive" : exp.soon ? "text-amber" : "text-muted-foreground hover:text-forest",
            )}
          >
            <Clock className="size-3" />
            {exp.text}
          </button>
          {expiryOpen
            ? EXPIRY_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  disabled={savingExpiry}
                  onClick={() => void applyExpiry(p.days)}
                  className="rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] font-bold transition-colors hover:bg-secondary disabled:opacity-50"
                >
                  {p.label}
                </button>
              ))
            : null}
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <IconButton label={reveal ? "Hide key" : "Reveal key"} onClick={() => setReveal((r) => !r)}>
          {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </IconButton>
        <IconButton label="Copy API key to clipboard" onClick={() => onCopy(t.value)}>
          {copied ? <Check className="size-4 text-positive" /> : <Copy className="size-4" />}
        </IconButton>
        <IconButton label="Remove API key" danger onClick={() => onRemove(t.value)}>
          <Trash2 className="size-4" />
        </IconButton>
      </div>
    </li>
  )
}

export default function TokensPage() {
  const { state, setState } = useDashboard()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  // Plaintext of the key created this session — surfaced in the "copy it now" reveal banner.
  const [revealed, setRevealed] = useState<string | null>(null)
  // Which key was most recently copied (by value), for the ✓ feedback on its button.
  const [copied, setCopied] = useState<string | null>(null)
  // The key value pending deletion — drives the confirm dialog (null = closed).
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  if (!state) {
    return (
      <div className="flex flex-col gap-[18px]">
        <Skeleton className="h-[78px] rounded-[var(--radius-xl)]" />
        <Skeleton className="h-[320px] rounded-[var(--radius-xl)]" />
      </div>
    )
  }

  const tokens = state.gate.tokens

  async function copyKey(value: string) {
    const ok = await copyText(value)
    if (ok) {
      setCopied(value)
      toast("API key copied to clipboard")
      window.setTimeout(() => setCopied((c) => (c === value ? null : c)), 1500)
    } else {
      toast("copy failed — reveal and copy manually")
    }
  }

  async function onGenerate() {
    setBusy(true)
    try {
      const r = await generateToken()
      setState(r)
      if (r.generated) {
        setRevealed(r.generated)
        void copyKey(r.generated)
      }
      toast("API key generated")
    } finally {
      setBusy(false)
    }
  }

  async function onSaveLabel(token: string, label: string) {
    try {
      setState(await setTokenLabel(token, label))
      toast(label ? "Label saved" : "Label cleared")
    } catch (e) {
      toast(e instanceof Error ? e.message : "failed to save label")
      throw e
    }
  }

  async function onSaveExpiry(token: string, expiresAt: number | null) {
    try {
      setState(await setTokenExpiry(token, expiresAt))
      toast(expiresAt ? "Expiry set" : "Expiry cleared")
    } catch (e) {
      toast(e instanceof Error ? e.message : "failed to set expiry")
      throw e
    }
  }

  async function confirmRemove() {
    if (!pendingDelete) return
    const value = pendingDelete
    setDeleting(true)
    try {
      setState(await removeToken(value))
      if (revealed === value) setRevealed(null)
      toast("API key removed")
      setPendingDelete(null)
    } catch (e) {
      toast(e instanceof Error ? e.message : "failed to remove key")
    } finally {
      setDeleting(false)
    }
  }

  const totalRequests = tokens.reduce((n, t) => n + t.requestCount, 0)

  return (
    <div className="flex flex-col gap-[18px]">
      <Card
        className={cn(
          "flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-4",
          tokens.length === 0 && "border-[rgba(217,48,37,0.35)] bg-[#FCE8E6]",
        )}
      >
        <span
          className={cn(
            "grid size-10 place-items-center rounded-[11px]",
            tokens.length ? "bg-[#E6F4EA] text-positive" : "bg-white text-destructive",
          )}
        >
          <ShieldCheck className="size-5" />
        </span>
        <div className="min-w-[160px]">
          <div className="flex items-center gap-2 text-[14px] font-extrabold tracking-[-0.02em]">
            API keys
            {tokens.length ? <Badge variant="on">{tokens.length} active</Badge> : <Badge variant="off">none</Badge>}
          </div>
          <div className="text-[12.5px] font-medium text-muted-foreground">
            {tokens.length
              ? "Any client presenting one of these keys may call the proxy"
              : "Proxy is failing closed — every request is rejected until you add a key"}
          </div>
        </div>
        <span className="flex-1" />
        <Button onClick={onGenerate} disabled={busy}>
          <Plus className="size-4" />
          Generate new key
        </Button>
      </Card>

      {revealed && (
        <Card className="border-[rgba(50,121,249,0.4)] bg-mint-soft p-4">
          <div className="flex items-center gap-2 text-[12.5px] font-bold text-forest">
            <KeyRound className="size-4" />
            New API key — copy it now, it won&apos;t be shown in full again
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setRevealed(null)}
              aria-label="Dismiss"
              className="grid size-6 place-items-center rounded-md text-forest/70 hover:bg-white/60 hover:text-forest"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 select-all break-all rounded-lg border border-border bg-white px-3 py-2 font-mono text-[13px]">
              {revealed}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyKey(revealed)}
              aria-label="Copy API key to clipboard"
              title="Copy to clipboard"
            >
              {copied === revealed ? <Check className="text-positive" /> : <Copy />}
            </Button>
          </div>
        </Card>
      )}

      {tokens.length > 0 ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-border-soft px-6 py-4">
            <span className="grid size-8 place-items-center rounded-[9px] bg-secondary text-forest">
              <KeyRound className="size-4" />
            </span>
            <div className="text-[14px] font-extrabold tracking-[-0.02em]">Active keys</div>
            <span className="text-[12px] text-muted-foreground tnum">
              · {tokens.length} key{tokens.length === 1 ? "" : "s"} · {totalRequests.toLocaleString()} request
              {totalRequests === 1 ? "" : "s"} served
            </span>
          </div>
          <ul>
            {tokens.map((t) => (
              <KeyRow
                key={t.masked}
                t={t}
                copied={copied === t.value}
                onCopy={copyKey}
                onRemove={setPendingDelete}
                onSaveLabel={onSaveLabel}
                onSaveExpiry={onSaveExpiry}
              />
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-[#FCE8E6] text-destructive">
            <ShieldCheck className="size-6" />
          </span>
          <div className="text-[14px] font-bold">No API keys yet</div>
          <p className="max-w-sm text-[12.5px] text-muted-foreground">
            The proxy rejects every request until at least one key exists. Generate one to get started.
          </p>
          <Button onClick={onGenerate} disabled={busy}>
            <Plus className="size-4" />
            Generate new key
          </Button>
        </Card>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Generate creates a fresh random key and copies it to your clipboard — it won&apos;t be shown in full again.
        Removing a key takes effect immediately. The proxy fails closed: with zero keys, every request is rejected.
      </p>

      <ConfirmDialog
        open={pendingDelete !== null}
        destructive
        title="Remove API key?"
        description={
          <>
            <code className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[12px]">
              {tokens.find((t) => t.value === pendingDelete)?.masked ?? "this key"}
            </code>{" "}
            will be deleted. Any client using it stops working immediately. This can&apos;t be undone.
          </>
        }
        confirmLabel="Remove key"
        busy={deleting}
        onConfirm={confirmRemove}
        onCancel={() => !deleting && setPendingDelete(null)}
      />
    </div>
  )
}
