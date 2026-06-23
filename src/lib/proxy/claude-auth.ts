// Reads the host's Claude Code subscription login (OAuth access token) so the proxy can forward
// `cli/claude-*` requests to the real Anthropic API with full fidelity — tools, subagents, streaming,
// everything — instead of the text-only `claude -p` fallback. macOS keeps the credential in the login
// keychain (where Claude Code wrote it); Linux / manual installs use ~/.claude/.credentials.json.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type SubToken = { token: string; expiresAt: number };

// Claude Code rotates the token in place; re-read at most once a minute so we always pick up a refresh
// without shelling out to the keychain on every request.
let _cache: { val: SubToken | null; at: number } | undefined;
const TTL_MS = 60_000;

function parse(raw: string): SubToken | null {
  try {
    const o = JSON.parse(raw)?.claudeAiOauth;
    if (o?.accessToken) return { token: String(o.accessToken), expiresAt: Number(o.expiresAt) || 0 };
  } catch {}
  return null;
}

function readRaw(): string | null {
  // 1) macOS login keychain — where Claude Code stores it on darwin.
  if (process.platform === "darwin") {
    try {
      return execFileSync("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {}
  }
  // 2) ~/.claude/.credentials.json — Linux, or when the keychain isn't used.
  try {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    const f = path.join(home, ".claude", ".credentials.json");
    if (fs.existsSync(f)) return fs.readFileSync(f, "utf8");
  } catch {}
  return null;
}

// The host's current Claude Code subscription token, or null if unavailable. Cached briefly.
export function subscriptionToken(): SubToken | null {
  const now = Date.now();
  if (_cache && now - _cache.at < TTL_MS) return _cache.val;
  const raw = readRaw();
  const val = raw ? parse(raw) : null;
  _cache = { val, at: now };
  return val;
}

// Usable = present and not past its expiry (a small skew guards against clock drift / imminent expiry).
export function subscriptionUsable(t: SubToken | null): t is SubToken {
  return !!t && (!t.expiresAt || t.expiresAt > Date.now() + 30_000);
}
