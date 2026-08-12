// Server runtime. See lib/observability/sentry-options for the privacy rules.
import * as Sentry from "@sentry/nextjs";
import { baseOptions, SENTRY_ENABLED } from "@/lib/observability/sentry-options";

if (SENTRY_ENABLED) {
  Sentry.init(baseOptions);
}
