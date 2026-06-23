"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutGrid, Boxes, KeyRound, ShieldCheck, Activity, ScrollText, LogOut, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { countServedModels, fmtAge } from "@/lib/api"
import { useDashboard } from "@/hooks/use-dashboard"
import { useAuth } from "@/hooks/use-auth"
import { LogoMark, Wordmark } from "@/components/brand/logo"

type Item = { to: string; label: string; icon: LucideIcon; count?: number }

export function Sidebar() {
  const { state } = useDashboard()
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const modelCount = state ? countServedModels(state.models) : undefined

  const items: Item[] = [
    { to: "/dashboard/overview", label: "Overview", icon: LayoutGrid },
    { to: "/dashboard/models", label: "Models", icon: Boxes, count: modelCount },
    { to: "/dashboard/credentials", label: "Credentials", icon: KeyRound },
    { to: "/dashboard/tokens", label: "API keys", icon: ShieldCheck, count: state?.gate.count },
    { to: "/dashboard/traffic", label: "Traffic", icon: Activity },
    { to: "/dashboard/logs", label: "Logs", icon: ScrollText },
  ]

  return (
    <aside className="sticky top-0 hidden h-screen flex-col gap-0.5 overflow-y-auto bg-forest p-[18px] text-[#eaf4ee] md:flex">
      <div className="flex items-center gap-3 px-2 pb-5 pt-1.5">
        <LogoMark className="size-9" />
        <Wordmark className="text-[20px] text-white" />
      </div>

      <div className="px-2.5 pb-1.5 pt-3 text-[10.5px] font-bold uppercase tracking-[0.13em] text-[#6e9485]">
        Dashboard
      </div>
      <nav className="flex flex-col gap-0.5">
        {items.map(({ to, label, icon: Icon, count }) => {
          const isActive = pathname === to
          return (
            <Link
              key={to}
              href={to}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-colors",
                isActive ? "bg-mint text-mint-ink" : "text-[#b7d2c6] hover:bg-white/[0.06] hover:text-[#eaf4ee]",
              )}
            >
              <Icon className={cn("size-[18px] shrink-0", isActive ? "opacity-100" : "opacity-90")} />
              <span>{label}</span>
              {count !== undefined ? (
                <span
                  className={cn(
                    "ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold",
                    isActive ? "bg-[#06332229] text-mint-ink" : "bg-white/[0.13] text-[#eaf4ee]",
                  )}
                >
                  {count}
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2 pt-4">
        {user && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-forest-line bg-forest-2 px-3 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-mint text-[13px] font-extrabold text-mint-ink">
              {user.email.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[#eaf4ee]" title={user.email}>
              {user.email}
            </span>
            <button
              type="button"
              onClick={logout}
              aria-label="Sign out"
              title="Sign out"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-[#9dbbad] transition-colors hover:bg-white/[0.08] hover:text-[#eaf4ee]"
            >
              <LogOut className="size-[17px]" />
            </button>
          </div>
        )}
        <div className="rounded-2xl border border-forest-line bg-forest-2 p-[13px]">
          <div className="flex items-center gap-2 text-[13px] font-bold text-[#eaf4ee]">
            <span className="size-2.5 rounded-full bg-mint shadow-[0_0_0_3px_rgba(24,224,140,0.3)]" />
            {state ? `online · ${state.server.host}:${state.server.port}` : "connecting…"}
          </div>
          <div className="mt-1.5 break-all font-mono text-[11.5px] leading-relaxed text-[#9dbbad]">
            {state ? (
              <>
                build {state.server.srcHash} · up {fmtAge(state.server.uptimeSec)}
              </>
            ) : (
              "—"
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
