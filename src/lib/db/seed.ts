// Seed: one-time import of the legacy keys.json into the DB so an existing install keeps its
// tokens / backend keys / settings. Idempotent — guarded by a `_seeded` marker, so re-running is a
// no-op. Used at runtime by db/index.ts (getDb), and runnable manually: `npm run db:seed`
// (honors CLAUDE_FREE_HOME for the target DB, same as the server).
/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import { KEYS_FILE } from "../env";
import { hashPassword } from "../proxy/password";

// Default dashboard login, created once on a DB with no users yet. Overridable via env for ops.
const DEFAULT_ADMIN_EMAIL = (process.env.CLAUDE_FREE_ADMIN_EMAIL || "admin@gmail.com").toLowerCase().trim();

// Seed the default admin account if the users table is empty. Idempotent — a no-op once any user
// exists, so changing the default email/password later (or adding users) is never clobbered.
// (Exported alongside seedFromKeysJson; both are called from db/index.ts on first connection.)
//
// SECURITY: there is deliberately NO static default password. A guessable constant combined with a
// network-reachable bind would be trivial dashboard takeover (→ all backend keys + the host's Claude
// subscription). If CLAUDE_FREE_ADMIN_PASSWORD is unset we mint a strong random one and print it once.
export function seedAdminUser(sqlite: Database.Database) {
  const row = sqlite.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number } | undefined;
  if (row && row.c > 0) return false;
  const envPw = process.env.CLAUDE_FREE_ADMIN_PASSWORD;
  const generated = !envPw;
  const password = envPw && envPw.length > 0 ? envPw : randomBytes(12).toString("base64url");
  sqlite
    .prepare("INSERT INTO users(email, password_hash, created_at) VALUES(?,?,?)")
    .run(DEFAULT_ADMIN_EMAIL, hashPassword(password), Date.now());
  if (generated) {
    // Printed once, only on first-ever boot. Not persisted in cleartext — only its hash is stored.
    console.warn(
      `\n[claude-free] Dashboard admin created: ${DEFAULT_ADMIN_EMAIL}\n` +
        `[claude-free] Generated password (shown once — save it): ${password}\n` +
        `[claude-free] Set CLAUDE_FREE_ADMIN_PASSWORD to choose your own.\n`,
    );
  }
  return true;
}

export function seedFromKeysJson(sqlite: Database.Database) {
  const seeded = sqlite.prepare("SELECT value FROM settings WHERE key='_seeded'").get();
  if (seeded) return false; // already seeded
  let k: any = {};
  try {
    k = JSON.parse(fs.readFileSync(KEYS_FILE, "utf8"));
  } catch {}
  const now = Date.now();
  const setS = sqlite.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)");
  const addTok = sqlite.prepare("INSERT OR IGNORE INTO access_tokens(token,created_at) VALUES(?,?)");
  const addDis = sqlite.prepare("INSERT OR IGNORE INTO disabled_models(model_id) VALUES(?)");
  const tx = sqlite.transaction(() => {
    for (const svc of ["tokenrouter", "openrouter", "gemini", "anthropic", "clinepass"]) {
      if (typeof k[svc] === "string" && k[svc]) setS.run(svc, k[svc]);
    }
    if (typeof k.admin_password === "string" && k.admin_password) setS.run("admin_password", k.admin_password);
    setS.run("server_enabled", k.server_enabled === false ? "false" : "true");
    if (Array.isArray(k.access_tokens)) for (const t of k.access_tokens) if (t) addTok.run(t, now);
    if (Array.isArray(k.disabled_models)) for (const m of k.disabled_models) if (m) addDis.run(m);
    setS.run("_seeded", String(now));
  });
  tx();
  return true;
}

// CLI: `npm run db:seed` (honors CLAUDE_FREE_HOME for the target DB).
if (process.argv[1]?.endsWith("/seed.ts")) {
  void (async () => {
    const { getDb } = await import("./index");
    getDb(); // ensures the schema exists, then runs seedFromKeysJson once
    console.log("✓ seed complete — schema ensured; keys.json imported on first run (idempotent otherwise)");
  })();
}
