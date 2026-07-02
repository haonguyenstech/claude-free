"use client"

import * as React from "react"
import { AlertTriangle, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export type ConfirmDialogProps = {
  open: boolean
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = React.useRef<HTMLButtonElement>(null)

  // Close on Escape; focus the primary action when opened; lock background scroll.
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel()
    }
    document.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const t = window.setTimeout(() => confirmRef.current?.focus(), 0)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
      window.clearTimeout(t)
    }
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div
        className="cf-overlay-in absolute inset-0 bg-forest/30 backdrop-blur-[2px]"
        onClick={() => !busy && onCancel()}
      />
      <div
        className={cn(
          "relative w-full max-w-md rounded-[var(--radius-xl)] border border-border bg-card p-6",
          "shadow-[0_1px_2px_rgba(18,19,23,0.06),0_32px_64px_-20px_rgba(18,19,23,0.4)]",
          "cf-dialog-in",
        )}
      >
        <button
          type="button"
          onClick={() => !busy && onCancel()}
          aria-label="Close"
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-forest"
        >
          <X className="size-4" />
        </button>

        <div className="flex gap-4">
          <span
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-[12px]",
              destructive ? "bg-[#FCE8E6] text-destructive" : "bg-[#E6F4EA] text-positive",
            )}
          >
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id="confirm-title" className="text-[16px] font-extrabold tracking-[-0.02em]">
              {title}
            </h2>
            {description ? (
              <div className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{description}</div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2.5">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={destructive ? "danger" : "default"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
