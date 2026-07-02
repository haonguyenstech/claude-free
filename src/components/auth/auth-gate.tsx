"use client"

import { useState, type ReactNode } from "react"
import { Loader2, Lock, LogIn, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/hooks/use-auth"
import { LogoMark, Wordmark } from "@/components/brand/logo"

function LoginScreen() {
  const { login } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : "login failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-secondary px-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark className="size-11" />
          <Wordmark className="text-[22px] text-forest" />
        </div>

        <div className="rounded-[var(--radius-xl)] border border-border bg-card p-7 shadow-[0_1px_2px_rgba(18,19,23,0.05),0_24px_48px_-20px_rgba(18,19,23,0.25)]">
          <h1 className="text-[20px] font-extrabold tracking-[-0.02em]">Sign in</h1>
          <p className="mt-1 text-[13px] font-medium text-muted-foreground">
            Log in to manage your proxy dashboard.
          </p>

          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-bold text-forest">Email</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@gmail.com"
                  autoComplete="username"
                  required
                  className="pl-9"
                />
              </div>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-bold text-forest">Password</span>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  autoComplete="current-password"
                  required
                  className="pl-9"
                />
              </div>
            </label>

            {error && (
              <div className="rounded-lg border border-[rgba(217,48,37,0.35)] bg-[#FCE8E6] px-3 py-2 text-[12.5px] font-semibold text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" size="lg" disabled={busy} className="mt-1">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-[12px] font-medium text-muted-foreground">
          Default user: <span className="font-bold text-forest">admin@gmail.com</span> · password is{" "}
          generated on first run (check the server logs), or set{" "}
          <code className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[11px]">
            CLAUDE_FREE_ADMIN_PASSWORD
          </code>
          .
        </p>
      </div>
    </div>
  )
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth()

  if (status === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-secondary">
        <Loader2 className="size-6 animate-spin text-positive" />
      </div>
    )
  }
  if (status === "guest") return <LoginScreen />
  return <>{children}</>
}
