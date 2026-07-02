"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

import { cn } from "@/lib/utils"

// A dark code/command block with a one-click copy button. Used on the landing page and docs.
export function CodeBlock({
  code,
  label,
  className,
}: {
  code: string
  label?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-[var(--radius-lg)] border border-forest-line bg-forest text-[#E6EAF0]",
        className,
      )}
    >
      {label ? (
        <div className="flex items-center gap-2 border-b border-forest-line px-4 py-2 text-[11.5px] font-bold uppercase tracking-[0.1em] text-[#7E828C]">
          <span className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </span>
          <span className="ml-1">{label}</span>
        </div>
      ) : null}
      <div className="flex items-start gap-3 px-4 py-3.5">
        <div className="cf-command-scrollbar min-w-0 flex-1">
          <pre className="min-w-full w-max font-mono text-[13px] leading-relaxed">
            <code>{code}</code>
          </pre>
        </div>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy to clipboard"}
          title={copied ? "Copied" : "Copy"}
          className={cn(
            "sticky top-0 grid size-8 shrink-0 place-items-center rounded-lg border border-forest-line bg-forest-2 text-[#AEB4C0] transition-colors",
            copied ? "text-positive" : "hover:bg-white/[0.08] hover:text-white",
          )}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  )
}
