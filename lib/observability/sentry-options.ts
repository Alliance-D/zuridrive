// =============================================================================
// ZuriDrive — Shared Sentry configuration
//
// Everything here is inert without SENTRY_DSN. That is deliberate: local
// development and the test suite must never post to an error tracker, and a
// missing DSN must never break a build.
//
// PRIVACY IS NOT OPTIONAL HERE. This platform holds national ID numbers,
// driving licence numbers, phone numbers, MoMo numbers and bank account
// details. An error tracker that captures request bodies would quietly become
// a second, less-protected copy of all of it — sitting on a third-party server
// outside Rwanda, which is exactly what the Privacy Policy says we do not do.
//
// So: no request bodies, no headers, no cookies, and a scrubber that runs over
// everything on its way out.
// =============================================================================

import type { ErrorEvent, EventHint } from "@sentry/nextjs";

export const SENTRY_DSN = process.env.SENTRY_DSN ?? "";
export const SENTRY_ENABLED = SENTRY_DSN.length > 0;

/** Keys whose values must never leave the building. */
const SENSITIVE_KEY = /(nationalId|licence|license|passport|phone|momo|bank|account|password|otp|token|secret|apiKey|authorization|cookie|proofUrl|email)/i;

const REDACTED = "[redacted]";

/**
 * Recursively replaces sensitive values.
 *
 * Depth-limited because Sentry payloads can contain cyclic or very deep
 * structures, and a scrubber that hangs is worse than no scrubber.
 */
function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;

  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? REDACTED : scrub(v, depth + 1);
    }
    return out;
  }

  if (typeof value === "string") {
    return value
      // Rwandan phone numbers, in any of the formats we accept.
      .replace(/(\+?25)?0?7[0-9]{8}/g, REDACTED)
      // Anything that looks like a long ID number.
      .replace(/\b\d{12,}\b/g, REDACTED);
  }

  return value;
}

/** Options shared by the server, edge and client runtimes. */
export const baseOptions = {
  dsn: SENTRY_DSN,
  enabled: SENTRY_ENABLED,
  environment: process.env.NODE_ENV,

  // Sample rather than send everything — this is a small platform and the
  // free tier is finite. Errors are always sent; traces are sampled.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,

  // The three settings that keep personal data out of the tracker.
  sendDefaultPii: false,
  maxValueLength: 2_000,

  /**
   * Last line of defence. Runs on every event, including ones Sentry's own
   * integrations produce.
   */
  beforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
    // Request bodies, cookies and headers are dropped wholesale rather than
    // scrubbed — there is nothing in them we need to debug an error, and
    // "scrubbed carefully" is a promise that eventually gets broken.
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
      delete event.request.headers;
      if (event.request.query_string) {
        event.request.query_string = REDACTED;
      }
    }

    delete event.user;

    return scrub(event) as ErrorEvent;
  },

  /** Noise that tells us nothing and burns quota. */
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "Non-Error promise rejection captured",
    "NEXT_NOT_FOUND",
    "NEXT_REDIRECT",
    /^AbortError/,
    /Failed to fetch/,
    /NetworkError/,
    /Load failed/,
  ],
};
