/**
 * Locale middleware — NOT YET ACTIVE.
 *
 * Enabling this requires every page to live under app/[locale]/. Until that
 * move happens, the middleware redirects / to /en and /en 404s, because there
 * is no [locale] segment to serve it.
 *
 * The rest of the i18n setup (routing config, request config, messages, the
 * switcher and the prompt bar) is complete and independent of this. To turn it
 * on, move the app directory and restore the matcher below.
 *
 * TO ACTIVATE:
 *   1. Create app/[locale]/ and move every route group into it — about 67
 *      page.tsx files, plus layout.tsx, not-found.tsx and error.tsx.
 *   2. Add `params: { locale }` to the root layout and wrap children in
 *      NextIntlClientProvider.
 *   3. Replace the matcher below with:
 *        ["/((?!api|_next|_vercel|.*\..*).*)"]
 */

import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Matches nothing. The negative lookahead excludes every path, so the
  // middleware is inert until the restructure above is done.
  matcher: ["/((?!.*).*)"],
};
