/**
 * Browser runtime.
 *
 * Uses NEXT_PUBLIC_SENTRY_DSN, not SENTRY_DSN — a server-only variable is not
 * inlined into the browser bundle, so gating on it here would silently disable
 * client reporting even when Sentry is configured.
 *
 * Session Replay is deliberately NOT enabled. It would record screens showing
 * licence photos, national ID numbers and payout details, which is precisely
 * the data the Privacy Policy promises we do not ship to third parties. See
 * lib/observability/sentry-options.
 */
import * as Sentry from "@sentry/nextjs";
import { baseOptions } from "@/lib/observability/sentry-options";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

if (dsn) {
  Sentry.init({ ...baseOptions, dsn, enabled: true });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
