"use client";

/**
 * A one-time offer to switch language.
 *
 * Deliberately a bar, not a modal. Someone arriving from a shared link or a
 * search result should see the car they came for, not a question blocking it —
 * that is the most expensive possible moment to interrupt them.
 *
 * It appears once, to anyone who has not already chosen. If the browser asks
 * for a language we offer, that is what gets suggested; otherwise it offers the
 * other one regardless.
 *
 * That second half matters more than it sounds. Phones here are sold set to
 * English and Kinyarwanda is rarely an option they list, so a rule that waits
 * for the browser to ask for Kinyarwanda would never fire for the person who
 * most wants it — someone reading English because of how their handset was
 * configured, not because they prefer it.
 *
 * Dismissing writes the cookie, so it never returns. The navbar switcher is the
 * permanent way back.
 */

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { X } from "lucide-react";
import { routing, LOCALE_LABELS, OFFERED_LOCALES, type Locale } from "@/i18n/routing";
import { LOCALE_COOKIE, LANG_ASKED_COOKIE } from "@/lib/locale-cookie";

/** Ask for this in the offered language, not the current one. */
const OFFER: Record<Locale, string> = {
  en: "View this page in English?",
  rw: "Ushaka kureba uru rupapuro mu Kinyarwanda?",
  sw: "Ungependa kuona ukurasa huu kwa Kiswahili?",
  fr: "Afficher cette page en français ?",
};

export default function LanguagePrompt() {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [suggest, setSuggest] = useState<Locale | null>(null);

  useEffect(() => {
    // Already asked — never ask again. Checked against our own marker, not
    // NEXT_LOCALE, which the middleware sets on the first request.
    if (document.cookie.includes(`${LANG_ASKED_COOKIE}=`)) return;

    // navigator.languages is ordered by preference: take the first we offer,
    // so "rw-RW, en-US" suggests Kinyarwanda rather than stopping at the first
    // entry we happen to recognise.
    const asked = navigator.languages
      .map((l) => l.split("-")[0].toLowerCase())
      .find((l) => (OFFERED_LOCALES as readonly string[]).includes(l)) as
      | Locale
      | undefined;

    if (asked && asked !== locale) {
      setSuggest(asked);
      return;
    }

    // Otherwise offer the other language anyway, once.
    //
    // This used to stop here, which meant the bar almost never appeared in
    // Rwanda: phones are sold set to English, so navigator.languages says "en",
    // the page is already English, and the code concluded there was nothing
    // worth saying. Kinyarwanda is rarely an option a phone even lists.
    //
    // That is precisely the person this exists for — someone reading English
    // because their handset was configured that way, not because they prefer
    // it. Asking once costs a dismissable bar; not asking costs them the
    // language they would rather read the whole site in.
    const other = OFFERED_LOCALES.find((l) => l !== locale);
    if (other) setSuggest(other as Locale);
  }, [locale]);

  function remember(choice: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${choice};path=/;max-age=31536000;samesite=lax`;
    document.cookie = `${LANG_ASKED_COOKIE}=1;path=/;max-age=31536000;samesite=lax`;

    // Store it against the account too, so SMS follows. Both buttons come
    // through here — keeping the current language is as much a preference as
    // switching, and SMS should honour it either way.
    void fetch("/api/me/locale", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: choice }),
    }).catch(() => {});
  }

  if (!suggest) return null;

  return (
    // Sits below the fixed navbar rather than in normal flow at the top of the
    // page. In flow it began at y=0, underneath the nav, and the nav swallowed
    // every click — the bar was visible and its buttons did nothing.
    <div
      role="region"
      aria-label="Language suggestion"
      style={{ zIndex: "calc(var(--z-sticky) - 1)" }}
      className="fixed left-0 right-0 top-[var(--nav-height)] flex flex-wrap items-center justify-center gap-3 border-b border-sand-dark bg-sand px-4 py-2.5 text-sm shadow-sm"
    >
      <span className="text-ink-muted">{OFFER[suggest]}</span>

      <button
        onClick={() => {
          remember(suggest);
          // usePathname() here has no locale segment and the router adds one,
          // so the path goes over as-is with the locale named separately.
          // Splicing it in by hand produced "/en/rw/cars".
          router.replace(pathname, { locale: suggest });
        }}
        className="rounded-full bg-brand px-3.5 py-1 text-xs font-semibold text-white hover:bg-brand-dark"
      >
        {LOCALE_LABELS[suggest]}
      </button>

      <button
        onClick={() => {
          // Keeping the current language is a choice too — record it, or the
          // bar reappears on every page they visit.
          remember(locale);
          setSuggest(null);
        }}
        aria-label="Keep current language"
        className="rounded p-1 text-ink-faint hover:bg-white hover:text-ink"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
