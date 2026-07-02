// Shared claude-free brand mark. A rounded "C" (for Claude) drawn as one thick gradient stroke —
// the open right side reads as a gateway/passthrough (the proxy). The stroke carries the Google
// four-colour flow (blue feet, warm peak) in the spirit of antigravity.google's arch mark.
// Used in the sidebar, the login screen, and mirrored by app/icon.svg for the favicon.
// One source of truth so the wordmark stays consistent everywhere.

import { cn } from "@/lib/utils"

import { useId } from "react"

export function LogoMark({ className }: { className?: string }) {
  // Unique, hydration-stable gradient id so multiple marks on one page don't clash.
  const id = `cf-logo-${useId().replace(/:/g, "")}`
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-[13px]",
        "bg-[linear-gradient(150deg,#26272e_0%,#18191d_55%,#0e0f13_100%)]",
        "shadow-[0_8px_22px_-6px_rgba(18,19,23,0.55),inset_0_1px_0_rgba(255,255,255,0.08)]",
        "ring-1 ring-inset ring-white/[0.06]",
        "size-10",
        className,
      )}
      aria-hidden="true"
    >
      {/* soft ambient glow so the gradient stroke lifts off the dark tile */}
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(66,133,244,0.28),transparent_64%)]" />
      <svg viewBox="0 0 64 64" className="relative size-[62%]" fill="none">
        <defs>
          {/* vertical flow: blue tips, warm middle — echoes the Antigravity arch */}
          <linearGradient id={id} x1="34" y1="10" x2="34" y2="54" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#4285F4" />
            <stop offset="0.28" stopColor="#34A853" />
            <stop offset="0.5" stopColor="#FBBC04" />
            <stop offset="0.72" stopColor="#EA4335" />
            <stop offset="1" stopColor="#4285F4" />
          </linearGradient>
        </defs>
        {/* open "C": arc from the top-right tip, the long way round the left, to the bottom-right tip */}
        <path
          d="M45.7 17.03 A19 19 0 1 0 45.7 46.97"
          stroke={`url(#${id})`}
          strokeWidth="9.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-extrabold tracking-[-0.03em]", className)}>
      claude<span className="text-mint">-free</span>
    </span>
  )
}
