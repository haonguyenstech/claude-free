"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutGrid,
  Boxes,
  ShieldCheck,
  Activity,
  ScrollText,
  LogOut,
  KeyRound,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { countServedModels, fmtAge } from "@/lib/api"
import { useDashboard } from "@/hooks/use-dashboard"
import { useAuth } from "@/hooks/use-auth"
import { useSidebar } from "@/components/layout/sidebar-context"
import { LogoMark, Wordmark } from "@/components/brand/logo"

type Item = { to: string; label: string; icon: LucideIcon; count?: number }

export function Sidebar() {
  const { state } = useDashboard()
  const { user, logout } = useAuth()
  const { collapsed, toggle } = useSidebar()
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
    <aside
      className={cn(
        "sticky top-0 hidden h-screen flex-col overflow-y-auto overflow-x-hidden bg-forest text-[#E6EAF0] md:flex",
        collapsed ? "items-center gap-1 px-2.5 py-[18px]" : "gap-0.5 p-[18px]",
      )}
    >
      {/* Brand + collapse toggle */}
      {collapsed ? (
        <div className="flex flex-col items-center gap-2 pb-3 pt-1">
          <LogoMark className="size-9" />
          <button
            type="button"
            onClick={toggle}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="grid size-9 place-items-center rounded-xl text-[#989DA8] transition-colors hover:bg-white/[0.08] hover:text-[#E6EAF0]"
          >
            <PanelLeftOpen className="size-[18px]" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-2 pb-5 pt-1.5">
          <LogoMark className="size-9" />
          <Wordmark className="text-[20px] text-white" />
          <button
            type="button"
            onClick={toggle}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="ml-auto grid size-8 place-items-center rounded-lg text-[#989DA8] transition-colors hover:bg-white/[0.08] hover:text-[#E6EAF0]"
          >
            <PanelLeftClose className="size-[18px]" />
          </button>
        </div>
      )}

      {!collapsed && (
        <div className="px-2.5 pb-1.5 pt-3 text-[10.5px] font-bold uppercase tracking-[0.13em] text-[#7E828C]">
          Dashboard
        </div>
      )}

      <nav className={cn("flex flex-col", collapsed ? "w-full items-center gap-1" : "gap-0.5")}>
        {items.map(({ to, label, icon: Icon, count }) => {
          const isActive = pathname === to

          if (collapsed) {
            const hasCount = count !== undefined && count > 0
            return (
              <Link
                key={to}
                href={to}
                aria-label={label}
                title={count !== undefined ? `${label} · ${count}` : label}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative grid size-11 place-items-center rounded-xl transition-colors",
                  isActive ? "bg-mint text-mint-ink" : "text-[#AEB4C0] hover:bg-white/[0.06] hover:text-[#E6EAF0]",
                )}
              >
                <Icon className="size-[19px]" />
                {hasCount && !isActive ? (
                  <span className="absolute right-[7px] top-[7px] size-[7px] rounded-full bg-mint ring-2 ring-forest" />
                ) : null}
              </Link>
            )
          }

          return (
            <Link
              key={to}
              href={to}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-full px-3.5 py-2.5 text-[14px] font-semibold transition-colors",
                isActive ? "bg-mint text-mint-ink" : "text-[#AEB4C0] hover:bg-white/[0.06] hover:text-[#E6EAF0]",
              )}
            >
              <Icon className={cn("size-[18px] shrink-0", isActive ? "opacity-100" : "opacity-90")} />
              <span>{label}</span>
              {count !== undefined ? (
                <span
                  className={cn(
                    "ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold",
                    isActive ? "bg-white/20 text-mint-ink" : "bg-white/[0.13] text-[#E6EAF0]",
                  )}
                >
                  {count}
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>

      {/* Footer — user, status, system-status link */}
      {collapsed ? (
        <div className="mt-auto flex flex-col items-center gap-1.5 pt-4">
          {user && (
            <span
              title={user.email}
              className="grid size-9 place-items-center rounded-full bg-mint text-[13px] font-extrabold text-mint-ink"
            >
              {user.email.charAt(0).toUpperCase()}
            </span>
          )}
          <span
            title={state ? `online · ${state.server.host}:${state.server.port}` : "connecting…"}
            className="grid size-9 place-items-center"
          >
            <span
              className={cn(
                "size-2.5 rounded-full",
                state ? "bg-[#34A853] shadow-[0_0_0_3px_rgba(52,168,83,0.3)]" : "bg-[#7E828C]",
              )}
            />
          </span>
          <a
            href="/status"
            target="_blank"
            rel="noreferrer"
            aria-label="System status"
            title="System status"
            className="grid size-9 place-items-center rounded-xl text-[#AEB4C0] transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <Activity className="size-[18px]" />
          </a>
          {user && (
            <button
              type="button"
              onClick={logout}
              aria-label="Sign out"
              title="Sign out"
              className="grid size-9 place-items-center rounded-xl text-[#989DA8] transition-colors hover:bg-white/[0.08] hover:text-[#E6EAF0]"
            >
              <LogOut className="size-[17px]" />
            </button>
          )}
        </div>
      ) : (
        <div className="mt-auto flex flex-col gap-2 pt-4">
          {user && (
            <div className="flex items-center gap-2.5 rounded-2xl border border-forest-line bg-forest-2 px-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-mint text-[13px] font-extrabold text-mint-ink">
                {user.email.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[#E6EAF0]" title={user.email}>
                {user.email}
              </span>
              <button
                type="button"
                onClick={logout}
                aria-label="Sign out"
                title="Sign out"
                className="grid size-8 shrink-0 place-items-center rounded-lg text-[#989DA8] transition-colors hover:bg-white/[0.08] hover:text-[#E6EAF0]"
              >
                <LogOut className="size-[17px]" />
              </button>
            </div>
          )}
          <div className="rounded-2xl border border-forest-line bg-forest-2 p-[13px]">
            <div className="flex items-center gap-2 text-[13px] font-bold text-[#E6EAF0]">
              <span className="size-2.5 rounded-full bg-[#34A853] shadow-[0_0_0_3px_rgba(52,168,83,0.3)]" />
              {state ? `online · ${state.server.host}:${state.server.port}` : "connecting…"}
            </div>
            <div className="mt-1.5 break-all font-mono text-[11.5px] leading-relaxed text-[#989DA8]">
              {state ? (
                <>
                  build {state.server.srcHash} · up {fmtAge(state.server.uptimeSec)}
                </>
              ) : (
                "—"
              )}
            </div>
            <a
              href="/status"
              target="_blank"
              rel="noreferrer"
              className="mt-2.5 inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[#AEB4C0] transition-colors hover:text-white"
            >
              <Activity className="size-3.5" /> System status ↗
            </a>
          </div>
        </div>
      )}
    </aside>
  )
}
