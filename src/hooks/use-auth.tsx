"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"

import { authMe, authLogin, authLogout, type AuthUser } from "@/lib/api"

type Status = "loading" | "authed" | "guest"

type Ctx = {
  user: AuthUser | null
  status: Status
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<Ctx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<Status>("loading")

  useEffect(() => {
    let alive = true
    authMe()
      .then((u) => alive && (setUser(u), setStatus("authed")))
      .catch(() => alive && (setUser(null), setStatus("guest")))
    return () => {
      alive = false
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const u = await authLogin(email, password)
    setUser(u)
    setStatus("authed")
  }, [])

  const logout = useCallback(async () => {
    await authLogout().catch(() => {})
    setUser(null)
    setStatus("guest")
  }, [])

  return <AuthContext.Provider value={{ user, status, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): Ctx {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
