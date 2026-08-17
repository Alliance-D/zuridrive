/**
 * lib/rate-limit.ts — fixed-window rate limiting, counted in the database.
 *
 * Not in process memory. Every serverless instance has its own memory, so an
 * in-process counter quietly multiplies the allowance by however many
 * instances happen to be running — the same reason the OTP send counter lives
 * on the user row.
 *
 * Fixed windows, not a sliding log. A fixed window lets through up to twice
 * the limit across a boundary, which is the known cost; it is one row and one
 * write per request, where a sliding log is a row per request. For stopping
 * password guessing and bulk scraping that trade is the right way round.
 *
 * Failing open is deliberate. If the counter itself errors, the request is
 * allowed: a database hiccup should not lock every visitor out of the site.
 * The one thing that must never happen is failing open silently, so it logs.
 */

import { prisma } from "@/lib/db";

export interface RateLimitResult {
  allowed: boolean;
  /** Requests left in this window. */
  remaining: number;
  /** When the window resets. */
  resetAt: Date;
}

/**
 * Count one hit against `key`.
 *
 * @param key    What is being limited — include the dimension, e.g.
 *               `login:+250788000000` or `cars:203.0.113.4`.
 * @param limit  Hits allowed per window.
 * @param windowMs Window length in milliseconds.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);

  try {
    const existing = await prisma.rateLimit.findUnique({ where: { key } });

    // No row, or the window has passed: start a fresh one. An expired row is
    // reused rather than deleted, so the request path never does cleanup.
    if (!existing || existing.expiresAt <= now) {
      await prisma.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, expiresAt: resetAt },
        update: { count: 1, expiresAt: resetAt },
      });
      return { allowed: true, remaining: limit - 1, resetAt };
    }

    if (existing.count >= limit) {
      return { allowed: false, remaining: 0, resetAt: existing.expiresAt };
    }

    const updated = await prisma.rateLimit.update({
      where: { key },
      data: { count: { increment: 1 } },
    });

    return {
      allowed: true,
      remaining: Math.max(0, limit - updated.count),
      resetAt: existing.expiresAt,
    };
  } catch (error) {
    console.error(`[rate-limit] counter failed for "${key}" — allowing`, error);
    return { allowed: true, remaining: limit, resetAt };
  }
}

/**
 * The caller's address, as best it can be known behind a proxy.
 *
 * Vercel and most proxies set x-forwarded-for; the first entry is the client.
 * A header can be forged, so this is a throttling key rather than an identity —
 * never use it for authorisation.
 */
export function clientIp(req: {
  headers: { get(name: string): string | null };
}): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Standard headers so a client can back off rather than hammer. */
export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Remaining": String(r.remaining),
    "X-RateLimit-Reset": String(Math.ceil(r.resetAt.getTime() / 1000)),
    ...(r.allowed
      ? {}
      : {
          "Retry-After": String(
            Math.max(1, Math.ceil((r.resetAt.getTime() - Date.now()) / 1000)),
          ),
        }),
  };
}
