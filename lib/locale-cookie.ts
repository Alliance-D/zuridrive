/**
 * The cookie next-intl uses to remember a chosen locale.
 *
 * Named here rather than typed as a literal in three components, because a
 * typo in one of them means the prompt bar reappears forever and the switcher
 * silently stops persisting.
 */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/**
 * Whether the visitor has been offered a language yet.
 *
 * Deliberately NOT the locale cookie. next-intl's middleware writes
 * NEXT_LOCALE on the very first request, so a prompt that treats that cookie
 * as "they have chosen" is suppressed before anyone has seen it — which is
 * exactly what happened: the bar could never appear at all.
 *
 * NEXT_LOCALE answers "which language do we serve". This answers "have we
 * already asked". They are different questions and need different cookies.
 */
export const LANG_ASKED_COOKIE = "ZD_LANG_ASKED";

/**
 * The locale to stamp on a newly created account.
 *
 * An account created mid-session has no stored preference yet, and the first
 * thing we do to it is send an SMS — the OTP. Reading the cookie the page was
 * already using means that code arrives in the language the person is looking
 * at, rather than defaulting to English because the row is one second old.
 *
 * Falls back to "en" for anything unrecognised, matching the routing default.
 */
export function localeFromRequest(req: {
  headers: { get(name: string): string | null };
}): string {
  // Read the header rather than NextRequest.cookies: this is called from route
  // handlers that are also invoked directly with a plain Request, and reaching
  // for `.cookies` there throws — taking the whole signup down with it.
  const header = req.headers?.get("cookie") ?? "";

  const match = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`));

  const value = match?.slice(LOCALE_COOKIE.length + 1);
  return value && ["en", "rw", "sw", "fr"].includes(value) ? value : "en";
}
