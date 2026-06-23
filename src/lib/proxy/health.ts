// Scheduled model health checks. Periodically runs the same self-test the dashboard uses
// (testModel) against every enabled model and persists the result via recordModelTest, so the
// Models page shows fresh health without an operator clicking "test" by hand.
//
// All DB/test access is wrapped defensively — the scheduler must never crash the server. The run
// loop is a self-rescheduling setTimeout chain (not setInterval) so an interval change takes effect
// on the next tick, and a long run can never overlap the next one.

import { buildState, testModel } from "./state";
import { getSetting, setSetting, serverEnabled } from "./config";
import { allowedTokens } from "./auth";
import { recordModelTest } from "../db";

export type HealthConfig = {
  enabled: boolean; // from setting "health_enabled" (default false)
  intervalMin: number; // from setting "health_interval_min" (default 30, floor 5, cap 1440)
  lastRunAt: number; // epoch ms from setting "health_last_run" (default 0)
  nextRunAt: number; // enabled && lastRunAt>0 ? lastRunAt + intervalMin*60000 : 0
  running: boolean; // true while a run is in progress
};

const INTERVAL_FLOOR = 5;
const INTERVAL_CAP = 1440;
const DEFAULT_INTERVAL = 30;
const STARTUP_DELAY_MS = 60_000;

// Module-level run guard. Prevents overlapping runs and is surfaced via getHealthConfig().running.
let running = false;

function clampInterval(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL;
  return Math.min(INTERVAL_CAP, Math.max(INTERVAL_FLOOR, Math.floor(n)));
}

// Best-effort setting read: never throws (DB access in the rest of the app is wrapped too).
function readSetting(key: string): string | undefined {
  try {
    return getSetting(key);
  } catch {
    return undefined;
  }
}

function writeSetting(key: string, value: string) {
  try {
    setSetting(key, value);
  } catch {}
}

export function getHealthConfig(): HealthConfig {
  const enabled = readSetting("health_enabled") === "true";
  const intervalMin = clampInterval(Number(readSetting("health_interval_min") ?? DEFAULT_INTERVAL));
  const lastRunAt = Number(readSetting("health_last_run") ?? 0) || 0;
  const nextRunAt = enabled && lastRunAt > 0 ? lastRunAt + intervalMin * 60000 : 0;
  return { enabled, intervalMin, lastRunAt, nextRunAt, running };
}

export function setHealthConfig(p: { enabled?: boolean; intervalMin?: number }): HealthConfig {
  if (typeof p.enabled === "boolean") writeSetting("health_enabled", p.enabled ? "true" : "false");
  if (typeof p.intervalMin === "number") writeSetting("health_interval_min", String(clampInterval(p.intervalMin)));
  return getHealthConfig();
}

// Collect the IDs of every enabled model from the dashboard state (flatten state.models, keep enabled).
function enabledModelIds(): string[] {
  try {
    const state = buildState();
    const ids: string[] = [];
    for (const tier of Object.values(state.models)) {
      for (const m of tier) {
        if (m.enabled) ids.push(m.id);
      }
    }
    return ids;
  } catch {
    return [];
  }
}

export async function runHealthChecks(): Promise<{ checked: number; ok: number; failed: number; ranAt: number }> {
  // No overlap — if a run is already in flight, return immediately with the last run timestamp.
  if (running) {
    return { checked: 0, ok: 0, failed: 0, ranAt: Number(readSetting("health_last_run") ?? 0) || 0 };
  }
  // Skip (without flipping running) when there is no API key configured or the proxy is paused.
  let hasKey = false;
  try {
    hasKey = allowedTokens().length > 0;
  } catch {
    hasKey = false;
  }
  if (!hasKey || !serverEnabled()) {
    return { checked: 0, ok: 0, failed: 0, ranAt: Number(readSetting("health_last_run") ?? 0) || 0 };
  }

  running = true;
  let ok = 0;
  let failed = 0;
  let checked = 0;
  try {
    const ids = enabledModelIds();
    // Sequential on purpose — these are real upstream calls; do NOT Promise.all them.
    for (const id of ids) {
      let result;
      try {
        result = await testModel(id);
      } catch (e) {
        result = { ok: false, error: (e as Error)?.message ?? "test threw" };
      }
      checked++;
      if (result.ok) ok++;
      else failed++;
      try {
        recordModelTest(id, result);
      } catch {}
    }
    const ranAt = Date.now();
    writeSetting("health_last_run", String(ranAt));
    return { checked, ok, failed, ranAt };
  } finally {
    running = false;
  }
}

export function startHealthScheduler(): void {
  // Idempotent + HMR-safe: a flag on globalThis survives module re-evaluation in dev.
  const g = globalThis as unknown as { __cfHealthStarted?: boolean };
  if (g.__cfHealthStarted) return;
  g.__cfHealthStarted = true;

  const scheduleNext = (delayMs: number) => {
    const t = setTimeout(async () => {
      try {
        const cfg = getHealthConfig();
        if (cfg.enabled && !cfg.running) {
          // A throw here must never kill the loop.
          try {
            await runHealthChecks();
          } catch {}
        }
      } catch {}
      // Always reschedule using the current interval so changes take effect next tick.
      let intervalMin = DEFAULT_INTERVAL;
      try {
        intervalMin = getHealthConfig().intervalMin;
      } catch {}
      scheduleNext(intervalMin * 60000);
    }, delayMs);
    // Don't keep the process alive just for the timer.
    if (typeof t.unref === "function") t.unref();
  };

  // First scheduling after a short startup delay so server boot isn't slowed.
  scheduleNext(STARTUP_DELAY_MS);
}
