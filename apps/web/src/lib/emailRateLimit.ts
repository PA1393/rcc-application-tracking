// In-process per-user rate limit. Window: RATE_MAX sends per RATE_WINDOW_MS per
// signed-in user. Memory only — adequate for a single-instance internal ATS.
// If we ever scale to multiple nodes, move this to Redis/DB.

export const RATE_WINDOW_MS = 60_000;
export const RATE_MAX = 10;
const sendLog = new Map<string, number[]>();

/**
 * Atomically reserves `n` rate-limit slots for `userId`.
 * If there are fewer than `n` slots remaining in the current window, returns
 * failure and does NOT consume any slots.
 * If successful, consumes exactly `n` slots.
 */
export function reserveRateLimit(
  userId: string,
  n: number
): { ok: true } | { ok: false; retryAfterSec: number; remaining: number } {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  const recent = (sendLog.get(userId) ?? []).filter((t) => t > cutoff);
  const remaining = Math.max(0, RATE_MAX - recent.length);

  if (n > remaining) {
    const oldest = recent[0];
    const retryAfterSec = oldest
      ? Math.max(1, Math.ceil((oldest + RATE_WINDOW_MS - now) / 1000))
      : 1;
    return { ok: false, retryAfterSec, remaining };
  }

  // Consume n slots
  const stamps = Array.from({ length: n }, () => now);
  sendLog.set(userId, [...recent, ...stamps]);
  return { ok: true };
}

/** Test-only hook. Clears all rate-limit state. No-op in normal operation. */
export function __resetRateLimitForTests() {
  sendLog.clear();
}
