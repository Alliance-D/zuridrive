/**
 * Locale-aware paths for server-side redirects.
 *
 * `redirect()` from next/navigation takes a raw path. Every guard in the app
 * called it with an unprefixed one — redirect("/login"), redirect("/owner/
 * onboarding") — which lands outside the [locale] segment. With the middleware
 * matcher broken those went straight to a 404; with it fixed they survive, but
 * only via a second request that re-derives the locale from a cookie. Reading
 * the locale we already have is both correct and one hop cheaper.
 *
 * These return the path rather than performing the redirect, so call sites read
 *
 *     redirect(await loginPath("/owner/fleet"));
 *
 * TypeScript only treats code after a call as unreachable when the call itself
 * returns `never`. Wrapping redirect() in an async helper hides that: `await
 * helper()` is an await expression, not a never-returning call, so every
 * `session` below the guard goes back to being possibly-null. Keeping
 * redirect() at the call site keeps the narrowing.
 */

import { getLocale } from "next-intl/server";

/** Prefix an in-app path with the request's locale. */
export async function localePath(path: string): Promise<string> {
  const locale = await getLocale();
  return `/${locale}${path}`;
}

/**
 * Where to send an unauthenticated visitor, remembering where they were.
 *
 * The `next` value is prefixed too — it is a path the login page sends the user
 * back to, so an unprefixed one would drop them out of their language at
 * exactly the moment they finish signing in.
 */
export async function loginPath(next?: string): Promise<string> {
  const locale = await getLocale();
  if (!next) return `/${locale}/login`;
  return `/${locale}/login?next=${encodeURIComponent(`/${locale}${next}`)}`;
}
