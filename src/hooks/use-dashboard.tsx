"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"

import { getState, type DashboardState } from "@/lib/api"

type Ctx = {
  state: DashboardState | null
  error: string | null
  loading: boolean
  /** Replace state directly (mutations return fresh state). */
  setState: (s: DashboardState) => void
  /** Re-fetch from the proxy now. */
  refresh: () => Promise<void>
}

const DashboardContext = createContext<Ctx | null>(null)

const POLL_MS = 5000

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DashboardState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const timer = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    try {
      const s = await getState()
      setState(s)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reach proxy")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      refresh()
    }
    timer.current = window.setInterval(tick, POLL_MS)
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") refresh()
    }
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible)
    return () => {
      if (timer.current) window.clearInterval(timer.current)
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refresh])

  return (
    <DashboardContext.Provider value={{ state, error, loading, setState, refresh }}>
      {children}
    </DashboardContext.Provider>
  )
}

export function useDashboard(): Ctx {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider")
  return ctx
}
