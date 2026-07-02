"use client"

// Collapse/expand state for the dashboard sidebar. Lives in a context because two siblings need it:
// the layout grid (to switch the sidebar column between rail and full width) and the Sidebar itself
// (to render icon-only vs. labelled). Persisted to localStorage so the choice survives navigation.
import { createContext, useContext, useEffect, useState } from "react"

type SidebarCtx = { collapsed: boolean; toggle: () => void; setCollapsed: (v: boolean) => void }

const Ctx = createContext<SidebarCtx | null>(null)
const STORAGE_KEY = "cf.sidebar.collapsed"

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  // Start expanded so SSR and first client render agree; hydrate the stored choice in an effect.
  const [collapsed, setCollapsed] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") setCollapsed(true)
    } catch {
      /* storage unavailable — stay expanded */
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0")
    } catch {
      /* ignore */
    }
  }, [collapsed, hydrated])

  return (
    <Ctx.Provider value={{ collapsed, toggle: () => setCollapsed((c) => !c), setCollapsed }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSidebar() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useSidebar must be used within a SidebarProvider")
  return ctx
}
