// Tiny in-memory sliding-window rate limiter for brute-force protection (e.g. the login endpoint).
// Module-level state — per-process, resets on restart. Not distributed; good enough for a single
// local proxy instance. Each key tracks recent attempt timestamps within the window.

const hits = new Map<string, number[]>();

// Record an attempt for `key` and report whether it is allowed. Prunes timestamps outside the
// window on each call. Returns ok=false (with retryAfterSec) once the window count reaches `max`.
export function rateLimit(
  key: string,
  opts?: { max?: number; windowMs?: number },
): { ok: boolean; retryAfterSec: number } {
  const max = opts?.max ?? 10;
  const windowMs = opts?.windowMs ?? 5 * 60 * 1000;
  const now = Date.now();
  const cutoff = now - windowMs;

  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);

  if (recent.length >= max) {
    // Window is full — deny. retryAfter = time until the oldest in-window attempt ages out.
    const retryAfterSec = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
    hits.set(key, recent);
    return { ok: false, retryAfterSec };
  }

  recent.push(now);
  hits.set(key, recent);
  return { ok: true, retryAfterSec: 0 };
}
