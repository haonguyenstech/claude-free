// Shared claude-free brand mark. A mint "spark" (four-point sparkle + accent) on a forest gradient
// tile — used in the sidebar, the login screen, and mirrored by app/icon.svg for the favicon.
// One source of truth so the wordmark stays consistent everywhere.

import { cn } from "@/lib/utils"

let _uid = 0

export function LogoMark({ className }: { className?: string }) {
  // Unique gradient ids so multiple marks on one page don't clash.
  const id = `cf-logo-${++_uid}`
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-[12px]",
        "bg-[linear-gradient(150deg,#0c4a38_0%,#0a3d2e_55%,#072b20_100%)]",
        "shadow-[0_8px_22px_-6px_rgba(10,61,46,0.65),inset_0_1px_0_rgba(255,255,255,0.08)]",
        "ring-1 ring-inset ring-white/[0.06]",
        "size-10",
        className,
      )}
      aria-hidden="true"
    >
      {/* soft mint glow behind the spark */}
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(24,224,140,0.45),transparent_62%)]" />
      <svg viewBox="0 0 64 64" className="relative size-[64%]" fill="none">
        <defs>
          <linearGradient id={id} x1="14" y1="8" x2="50" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#7dffc6" />
            <stop offset="0.5" stopColor="#18e08c" />
            <stop offset="1" stopColor="#0fbf74" />
          </linearGradient>
        </defs>
        {/* primary four-point sparkle */}
        <path
          d="M32 3c1.4 17.6 9 25.2 26.6 26.6C41 31 33.4 38.6 32 56.2 30.6 38.6 23 31 5.4 29.6 23 28.2 30.6 20.6 32 3Z"
          fill={`url(#${id})`}
        />
        {/* small accent spark, top-right */}
        <path
          d="M52 4c.5 5.6 3 8.1 8.6 8.6C55 13.1 52.5 15.6 52 21.2 51.5 15.6 49 13.1 43.4 12.6 49 12.1 51.5 9.6 52 4Z"
          fill={`url(#${id})`}
          opacity="0.85"
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
