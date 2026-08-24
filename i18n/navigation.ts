/**
 * Locale-aware navigation.
 *
 * The locale lives in the URL — /rw/cars — and `localePrefix: "always"` means
 * every internal path needs one. A plain next/link to "/cars" has no locale in
 * it, so the middleware has to guess, and it guesses from a cookie that was
 * written a moment ago by the switcher. The result was a language that changed
 * back on the next click and only stuck after a reload: the URL said one thing
 * and the cookie another, and whichever won depended on timing.
 *
 * These wrappers put the current locale into the href at render time, so there
 * is nothing left to guess. Someone reading /rw/cars clicks a link and lands on
 * /rw/how-it-works, with no redirect in between.
 *
 * Import Link, useRouter, usePathname and redirect from here rather than from
 * next/link or next/navigation, anywhere the destination is a page in this app.
 * External URLs still belong to a plain anchor.
 */

import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
