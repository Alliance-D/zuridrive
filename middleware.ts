/**
 * Locale middleware.
 *
 * Redirects an unprefixed path to the visitor's best-matching locale, using the
 * NEXT_LOCALE cookie first and Accept-Language after — so someone whose phone
 * is set to Kinyarwanda lands on /rw without being asked anything.
 *
 * The matcher deliberately excludes /api, Next internals and anything with a
 * file extension. Prefixing an API route with a locale would break every fetch
 * in the app, and static assets have no language.
 */

import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\..*).*)"],
};
