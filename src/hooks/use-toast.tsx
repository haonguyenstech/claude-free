"use client"

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

// Minimal single-line toast — mirrors the original dashboard's bottom-center pill.
const ToastContext = createContext<(msg: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState("")
  const [show, setShow] = useState(false)
  const timer = useRef<number | null>(null)

  const toast = useCallback((m: string) => {
    setMsg(m)
    setShow(true)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setShow(false), 2000)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        role="status"
        className={cn(
          "pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-forest px-[18px] py-2.5 text-[13px] font-semibold text-[#eaf4ee] shadow-[0_16px_40px_-12px_rgba(10,40,30,0.5)] transition-opacity duration-200",
          show ? "opacity-100" : "opacity-0",
        )}
      >
        {msg}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
