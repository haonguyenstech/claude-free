// Typed client for the claude-free proxy admin API (/dashboard/api/*).
// Auth: a login session (HttpOnly cookie, sent automatically same-origin) gates these endpoints;
// the optional x-admin-password header is an ops fallback. Same-origin — the dashboard and these
// endpoints are served by one server.

export type ModelTest = {
  ts: number
  ok: boolean
  status: number | null
  ms: number | null
  sample: string | null
  error: string | null
}

export type Model = {
  id: string
  name: string
  ctx: string
  tps: number
  enabled: boolean
  lastTest: ModelTest | null
}

export type Backend = {
  id: string
  label: string
  hint: string
  set: boolean
  masked: string
  fromEnv: boolean
  value: string
  link?: string
  linkLabel?: string
}

export type DashboardState = {
  server: {
    host: string
    port: number
    pid: number
    node: string
    srcHash: string
    uptimeSec: number
    adminProtected: boolean
    enabled: boolean
  }
  gate: {
    count: number
    tokens: {
      masked: string
      value: string
      label: string | null
      requestCount: number
      lastUsedAt: number | null
      createdAt: number
      expiresAt: number | null
    }[]
  }
  backends: Backend[]
  models: Record<string, Model[]>
  stats: {
    total: number
    errors: number
    byBackend: Record<string, number>
    lastModel: string | null
    lastAt: number | null
  }
}

export type TestResult = {
  ok: boolean
  ms?: number
  status?: number
  sample?: string
  error?: string
}

export type RecentRequest = {
  ts: number
  model: string
  backend: string
  status: number
  latencyMs: number
  ttftMs: number
  inputTokens: number
  outputTokens: number
  stream: boolean
}

export type ModelPerf = {
  model: string
  count: number
  avgTtftMs: number | null
  tokPerSec: number | null
}

export type TokenUsage = {
  masked: string
  label: string | null
  count: number
  errors: number
  inputTokens: number
  outputTokens: number
  lastAt: number | null
}

export type RateLimit = {
  modelId: string
  ts: number
  status?: number | null
  requestsRemaining?: number | null
  requestsLimit?: number | null
  tokensRemaining?: number | null
  tokensLimit?: number | null
  resetAt?: number | null
  retryAfter?: number | null
}

export type TrafficData = {
  totals: {
    total: number
    errors: number
    successRate: number
    avgLatencyMs: number
    inputTokens: number
    outputTokens: number
  }
  byBackend: { backend: string; count: number; errors: number }[]
  byModel: ModelPerf[]
  byToken: TokenUsage[]
  series: { t: number; count: number; errors: number }[]
  daily: { t: number; count: number; inputTokens: number; outputTokens: number }[]
  rateLimits: RateLimit[]
  recent: RecentRequest[]
  lastAt: number | null
}

const PW_KEY = "cf_admin_pw"

function headers(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" }
  const pw = localStorage.getItem(PW_KEY)
  if (pw) h["x-admin-password"] = pw
  return h
}

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...opts, headers: headers() })
  if (res.status === 401) {
    const j = await res.json().catch(() => ({}) as { needsPassword?: boolean })
    if (j && j.needsPassword) {
      const pw = window.prompt("Admin password:") || ""
      localStorage.setItem(PW_KEY, pw)
      return api<T>(path, opts)
    }
    throw new Error("Unauthorized — admin password required.")
  }
  if (!res.ok) throw new Error(`Request failed (HTTP ${res.status})`)
  return res.json() as Promise<T>
}

export const getState = () => api<DashboardState>("/dashboard/api/state")

export const getTraffic = () => api<TrafficData>("/dashboard/api/traffic")

// ---- Dashboard auth (session cookie, sent automatically same-origin) ----
export type AuthUser = { email: string }

export const authMe = async (): Promise<AuthUser> => {
  const res = await fetch("/dashboard/api/auth/me")
  if (!res.ok) throw new Error("unauthenticated")
  return res.json() as Promise<AuthUser>
}

export const authLogin = async (email: string, password: string): Promise<AuthUser> => {
  const res = await fetch("/dashboard/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(j.error || "login failed")
  }
  return res.json() as Promise<AuthUser>
}

export const authLogout = () => fetch("/dashboard/api/auth/logout", { method: "POST" })

export const saveKey = (id: string, value: string) =>
  api<DashboardState>("/dashboard/api/keys", {
    method: "POST",
    body: JSON.stringify({ [id]: value }),
  })

export const removeKey = (id: string) =>
  api<DashboardState>("/dashboard/api/keys", {
    method: "POST",
    body: JSON.stringify({ remove: id }),
  })

export const addToken = (token: string) =>
  api<DashboardState>("/dashboard/api/tokens", {
    method: "POST",
    body: JSON.stringify({ action: "add", token }),
  })

export const removeToken = (token: string) =>
  api<DashboardState>("/dashboard/api/tokens", {
    method: "POST",
    body: JSON.stringify({ action: "remove", token }),
  })

export const setTokenLabel = (token: string, label: string) =>
  api<DashboardState>("/dashboard/api/tokens", {
    method: "POST",
    body: JSON.stringify({ action: "label", token, label }),
  })

export const generateToken = () =>
  api<DashboardState & { generated?: string }>("/dashboard/api/tokens", {
    method: "POST",
    body: JSON.stringify({ action: "generate" }),
  })

// Set/clear a token's expiry. expiresAt is epoch ms, or null to make it never expire.
export const setTokenExpiry = (token: string, expiresAt: number | null) =>
  api<DashboardState>("/dashboard/api/tokens", {
    method: "POST",
    body: JSON.stringify({ action: "expiry", token, expiresAt }),
  })

// Download the filtered request log as a CSV file (admin-gated, so we fetch with the pw header then
// trigger a client-side download from the blob — a plain <a download> wouldn't carry the header).
export async function downloadLogsCsv(params: URLSearchParams): Promise<void> {
  const headers: Record<string, string> = {}
  const pw = typeof localStorage !== "undefined" ? localStorage.getItem(PW_KEY) : null
  if (pw) headers["x-admin-password"] = pw
  const res = await fetch(`/dashboard/api/logs/export?${params.toString()}`, { headers })
  if (!res.ok) throw new Error(`Export failed (HTTP ${res.status})`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `claude-free-logs-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export const setServerEnabled = (enabled: boolean) =>
  api<DashboardState>("/dashboard/api/settings", {
    method: "POST",
    body: JSON.stringify({ target: "server", enabled }),
  })

export const setModelEnabled = (id: string, enabled: boolean) =>
  api<DashboardState>("/dashboard/api/settings", {
    method: "POST",
    body: JSON.stringify({ target: "model", id, enabled }),
  })

export const testModel = (model: string) =>
  api<TestResult>("/dashboard/api/test", {
    method: "POST",
    body: JSON.stringify({ model }),
  })

export type HealthConfig = {
  enabled: boolean
  intervalMin: number
  lastRunAt: number
  nextRunAt: number
  running: boolean
}

export type HealthResult = {
  checked: number
  ok: number
  failed: number
  ranAt: number
}

export const getHealth = async (): Promise<HealthConfig> => {
  const { config } = await api<{ config: HealthConfig }>("/dashboard/api/health")
  return config
}

export const setHealthConfig = async (p: { enabled?: boolean; intervalMin?: number }): Promise<HealthConfig> => {
  const { config } = await api<{ config: HealthConfig }>("/dashboard/api/health", {
    method: "POST",
    body: JSON.stringify(p),
  })
  return config
}

export const runHealthNow = () =>
  api<{ config: HealthConfig; result: HealthResult }>("/dashboard/api/health", {
    method: "POST",
    body: JSON.stringify({ action: "run" }),
  })

export function fmtAge(sec: number): string {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`
  return `${Math.floor(sec / 86400)}d`
}

// `cli/*` are duplicate CLI-routed aliases of the `anthropic` Claude models and aren't listed on
// the Models page, so they must not inflate the served-models count shown on Overview / sidebar.
export function countServedModels(models: DashboardState["models"]): number {
  return Object.entries(models).reduce((n, [tier, list]) => (tier === "cli" ? n : n + (list?.length ?? 0)), 0)
}
