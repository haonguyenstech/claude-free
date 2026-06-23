// Server-side config + operator switches, now backed by SQLite (was keys.json). Read fresh on every
// call so dashboard edits and pause/disable toggles take effect on the next request. Env vars still
// override (CLAUDE_FREE_OFF, *_KEY/*_API_KEY, CLAUDE_FREE_ADMIN) for ops.

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { settings, disabledModels } from "../db/schema";

export { DATA_DIR, KEYS_FILE } from "../env";

export function getSetting(key: string): string | undefined {
  const row = getDb().select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? undefined;
}
export function setSetting(key: string, value: string) {
  getDb().insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
}
export function deleteSetting(key: string) {
  getDb().delete(settings).where(eq(settings.key, key)).run();
}

// Backend credential: env override first, else the DB settings row.
export function serverKey(service: string): string {
  return (
    process.env[service.toUpperCase() + "_KEY"] ||
    process.env[service.toUpperCase() + "_API_KEY"] ||
    getSetting(service) ||
    ""
  );
}
export function setBackendKey(service: string, value: string) {
  setSetting(service, value);
}
export function removeBackendKey(service: string) {
  deleteSetting(service);
}

// ---- Operator on/off switches (live: read from the DB on every request) ----
export function serverEnabled(): boolean {
  if (process.env.CLAUDE_FREE_OFF === "1") return false;
  return getSetting("server_enabled") !== "false";
}
export function setServerEnabledFlag(enabled: boolean) {
  setSetting("server_enabled", enabled ? "true" : "false");
}

export function disabledModelSet(): Set<string> {
  const rows = getDb().select({ id: disabledModels.modelId }).from(disabledModels).all();
  return new Set(rows.map((r) => r.id));
}
export function setModelDisabled(id: string, disabled: boolean) {
  if (disabled) getDb().insert(disabledModels).values({ modelId: id }).onConflictDoNothing().run();
  else getDb().delete(disabledModels).where(eq(disabledModels.modelId, id)).run();
}

// Normalize a requested model name to the id the dashboard toggles use (strip :think, fold mimo alias).
export function dashboardModelId(raw: string | undefined): string {
  const base = raw && raw.endsWith(":think") ? raw.slice(0, -6) : raw || "";
  return base === "mimo/mimo-auto" ? "mimo-auto" : base;
}

export function adminPassword(): string {
  return process.env.CLAUDE_FREE_ADMIN || getSetting("admin_password") || "";
}
