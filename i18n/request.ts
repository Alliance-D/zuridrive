/**
 * Per-request locale resolution.
 *
 * Messages for the default locale are merged underneath the requested one, so a
 * key that has not been translated yet renders in Kinyarwanda instead of
 * throwing or showing a raw key. That matters while translation is in progress:
 * a half-translated page should still be usable.
 */

import { getRequestConfig } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = (
    routing.locales.includes(requested as Locale) ? requested : routing.defaultLocale
  ) as Locale;

  const fallback = (await import(`../messages/${routing.defaultLocale}.json`)).default;
  const messages =
    locale === routing.defaultLocale
      ? fallback
      : { ...fallback, ...(await import(`../messages/${locale}.json`)).default };

  return { locale, messages };
});
