"use client";

/**
 * app/error.tsx — the render error boundary.
 *
 * There wasn't one. An unhandled error during render showed Next.js's raw
 * error overlay in development and an unstyled default page in production —
 * no branding, no navigation, and no reassurance about whether money moved.
 *
 * That last part matters on a booking platform: someone whose payment page
 * crashes needs to be told the charge did not go through, not left guessing.
 *
 * The error itself is not shown. A stack trace is useless to a renter and can
 * leak table and column names; it goes to the console (and to Sentry, which is
 * already configured) instead.
 */

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/routes";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("error");
  useEffect(() => {
    console.error("[render error]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bone px-4">
      <div className="max-w-lg text-center">
        <p className="label mb-4 block text-danger-error">◆ {t("eyebrow")}</p>

        <h1 className="mb-4 font-display text-fluid-3xl font-normal leading-[1.1] tracking-[-0.03em] text-ink">
          {t("title")}
        </h1>

        <p className="mx-auto mb-8 max-w-[46ch] text-fluid-base leading-[1.7] text-ink-soft">
          {t("body")}
        </p>

        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={reset} className="btn btn-primary btn-lg">
            {t("tryAgain")}
          </button>
          <Link href={ROUTES.home} className="btn btn-secondary btn-lg">
            {t("goHome")}
          </Link>
        </div>

        {/* The digest is the only thing worth surfacing: it is the id support
            needs to find this exact error in the logs. */}
        {error.digest && (
          <p className="mt-8 font-mono text-fluid-xs text-ink-faint">
            {t("reference", { digest: error.digest })}
          </p>
        )}
      </div>
    </div>
  );
}
