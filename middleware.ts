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
  // The backslash must be escaped. "\." inside a string literal is just ".",
  // which turned the lookahead into `.*..*` — a pattern matching any path of
  // two characters or more. The matcher therefore excluded everything except
  // "/", so no unprefixed path was ever redirected to a locale; /cars, /login
  // and /owner/onboarding all fell through to a 404 instead.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
