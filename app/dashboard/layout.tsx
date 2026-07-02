"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { DashboardProvider } from "@/hooks/use-dashboard"
import { ToastProvider } from "@/hooks/use-toast"
import { AuthProvider } from "@/hooks/use-auth"
import { AuthGate } from "@/components/auth/auth-gate"
import { Sidebar } from "@/components/layout/sidebar"
import { SidebarProvider, useSidebar } from "@/components/layout/sidebar-context"
import { Topbar } from "@/components/layout/topbar"

const MOBILE_LINKS = [
  { to: "/dashboard/overview", label: "Overview" },
  { to: "/dashboard/models", label: "Models" },
  { to: "/dashboard/credentials", label: "Credentials" },
  { to: "/dashboard/tokens", label: "API keys" },
  { to: "/dashboard/traffic", label: "Traffic" },
  { to: "/dashboard/logs", label: "Logs" },
]

function MobileNav() {
  const pathname = usePathname()
  return (
    <nav className="mb-5 flex gap-1.5 overflow-x-auto md:hidden">
      {MOBILE_LINKS.map((l) => {
        const isActive = pathname === l.to
        return (
          <Link
            key={l.to}
            href={l.to}
            className={cn(
              "whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-colors",
              isActive ? "bg-forest text-[#E6EAF0]" : "bg-card text-muted-foreground border border-border",
            )}
          >
            {l.label}
          </Link>
        )
      })}
    </nav>
  )
}

// The grid lives in its own component so it can read the sidebar's collapse state and switch the
// first column between the icon rail and the full panel. The transition animates the reflow.
function DashboardShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar()
  return (
    <div
      className={cn(
        "grid min-h-screen grid-cols-1 transition-[grid-template-columns] duration-200 ease-out",
        collapsed ? "md:grid-cols-[68px_1fr]" : "md:grid-cols-[258px_1fr]",
      )}
    >
      <Sidebar />
      <main className="min-w-0 px-4 pb-16 pt-5 md:px-8 md:pt-7">
        <div className="mx-auto w-full max-w-[1280px]">
          <MobileNav />
          <Topbar />
          {children}
        </div>
      </main>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <AuthGate>
          <DashboardProvider>
            <SidebarProvider>
              <DashboardShell>{children}</DashboardShell>
            </SidebarProvider>
          </DashboardProvider>
        </AuthGate>
      </AuthProvider>
    </ToastProvider>
  )
}
