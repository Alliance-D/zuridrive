// Browser runtime. See lib/observability/sentry-options for the privacy rules.
//
// Server and edge had configs; the browser did not, so every client-side error
// — a form that throws on submit, a hydration failure, a fetch that rejects —
// was invisible. Those are exactly the errors nobody reports and everybody
// works around.
import * as Sentry from "@sentry/nextjs";
import { baseOptions, SENTRY_ENABLED } from "@/lib/observability/sentry-options";

if (SENTRY_ENABLED) {
  Sentry.init(baseOptions);
}
