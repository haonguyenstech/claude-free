"use client"

import { useEffect, useState } from "react"
import {
  Check,
  Coins,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Sparkles,
  Waypoints,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useDashboard } from "@/hooks/use-dashboard"
import { useToast } from "@/hooks/use-toast"
import { saveKey, removeKey, type Backend } from "@/lib/api"

// Per-provider presentation — icon + accent tile so the three backends read as distinct cards.
const META: Record<string, { icon: LucideIcon; tile: string }> = {
  tokenrouter: { icon: Coins, tile: "bg-[#fff4e2] text-[#c77f10]" },
  openrouter: { icon: Waypoints, tile: "bg-[#edeeff] text-[#4f57c4]" },
  gemini: { icon: Sparkles, tile: "bg-[#f3ecff] text-[#7c4dff]" },
}
const FALLBACK = { icon: KeyRound, tile: "bg-secondary text-forest" }

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

function CredentialCard({ b }: { b: Backend }) {
  const { setState } = useDashboard()
  const toast = useToast()
  // One field per provider: empty `value` means "show the stored key". Typing replaces it.
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [reveal, setReveal] = useState(false)
  const [copied, setCopied] = useState(false)

  const { icon: Icon, tile } = META[b.id] ?? FALLBACK
  const editable = !b.fromEnv
  // A save is meaningful only when the field holds something new (not the unchanged stored key).
  const dirty = value.trim() !== "" && value !== b.value

  // Reset the field when the upstream key changes (e.g. after a save), unless it's being edited.
  useEffect(() => {
    if (document.activeElement?.id !== `k_${b.id}`) {
      setValue("")
      setReveal(false)
    }
  }, [b.value, b.id])

  async function onSave() {
    if (!dirty) return
    setBusy(true)
    try {
      setState(await saveKey(b.id, value.trim()))
      setValue("")
      setReveal(false)
      toast(`saved ${b.label}`)
    } finally {
      setBusy(false)
    }
  }
  async function onRemove() {
    if (!confirm(`Remove ${b.label}? This deletes the stored credential.`)) return
    setBusy(true)
    try {
      setState(await removeKey(b.id))
      setValue("")
      setReveal(false)
      toast(`removed ${b.label}`)
    } finally {
      setBusy(false)
    }
  }
  async function onCopy() {
    if (await copyText(value || b.value)) {
      setCopied(true)
      toast("credential copied to clipboard")
      window.setTimeout(() => setCopied(false), 1500)
    } else {
      toast("copy failed — reveal and copy manually")
    }
  }
  // Eye: first reveal pulls the stored plaintext into the field so it's visible & selectable.
  function toggleReveal() {
    if (!reveal && b.set && value === "") setValue(b.value)
    setReveal((r) => !r)
  }

  const status = b.fromEnv ? "env" : b.set ? "set" : "off"

  return (
    <Card className="flex flex-col gap-4 p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(10,40,30,0.05),0_24px_48px_-16px_rgba(10,40,30,0.22)]">
      <div className="flex items-start gap-3">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-[12px]", tile)}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-extrabold tracking-[-0.02em]">{b.label}</span>
            {status === "env" ? (
              <Badge variant="env">env</Badge>
            ) : status === "set" ? (
              <Badge variant="on">set</Badge>
            ) : (
              <Badge variant="off">not set</Badge>
            )}
          </div>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">{b.hint}</p>
        </div>
      </div>

      {b.fromEnv ? (
        // Managed by an env var — show the masked value, locked, with no controls.
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border-soft bg-muted px-3 py-2.5">
          <Lock className="size-3.5 shrink-0 text-muted-foreground" />
          <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-foreground">
            {b.masked || "set via environment"}
          </code>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Input
              id={`k_${b.id}`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSave()}
              type={reveal ? "text" : "password"}
              placeholder={b.set ? b.masked : "paste value…"}
              autoComplete="off"
              spellCheck={false}
              className={cn("font-mono", b.set ? "pr-[4.25rem]" : "pr-9")}
            />
            <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
              <button
                type="button"
                onClick={toggleReveal}
                aria-label={reveal ? "Hide credential" : "Reveal credential"}
                title={reveal ? "Hide" : "Reveal"}
                className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-forest"
              >
                {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
              {b.set && (
                <button
                  type="button"
                  onClick={onCopy}
                  aria-label="Copy credential to clipboard"
                  title="Copy to clipboard"
                  className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-forest"
                >
                  {copied ? <Check className="size-4 text-positive" /> : <Copy className="size-4" />}
                </button>
              )}
            </div>
          </div>
          <Button onClick={onSave} disabled={busy || !dirty}>
            {b.set ? "Replace" : "Save"}
          </Button>
          {b.set && (
            <Button variant="danger" onClick={onRemove} disabled={busy}>
              Remove
            </Button>
          )}
        </div>
      )}

      {b.link && !b.set && (
        <a
          href={b.link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1 text-[12.5px] font-bold text-positive hover:underline"
        >
          {b.linkLabel || "Get a key"} <ExternalLink className="size-3.5" />
        </a>
      )}
    </Card>
  )
}

export default function CredentialsPage() {
  const { state } = useDashboard()
  if (!state) {
    return (
      <div className="grid gap-[18px] xl:grid-cols-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[200px] rounded-[var(--radius-xl)]" />
        ))}
      </div>
    )
  }

  const total = state.backends.length
  const live = state.backends.filter((b) => b.set).length

  return (
    <div className="flex flex-col gap-[18px]">
      <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
        <span className="grid size-10 place-items-center rounded-[11px] bg-mint-soft text-positive">
          <KeyRound className="size-5" />
        </span>
        <div className="min-w-[160px]">
          <div className="text-[14px] font-extrabold tracking-[-0.02em]">Backend credentials</div>
          <div className="text-[12.5px] font-medium text-muted-foreground">
            Keys that unlock the paid &amp; keyed model tiers
          </div>
        </div>
        <span className="flex-1" />
        <div className="text-right">
          <div className="text-[22px] font-extrabold tracking-[-0.04em] tnum">
            {live}
            <span className="text-muted-foreground">/{total}</span>
          </div>
          <div className="text-[11.5px] font-semibold text-muted-foreground">configured</div>
        </div>
      </Card>

      <div className="grid gap-[18px] xl:grid-cols-2">
        {state.backends.map((b) => (
          <CredentialCard key={b.id} b={b} />
        ))}
      </div>
    </div>
  )
}
