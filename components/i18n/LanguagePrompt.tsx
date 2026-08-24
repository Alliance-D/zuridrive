"use client";

/**
 * A one-time offer to switch language.
 *
 * Deliberately a bar, not a modal. Someone arriving from a shared link or a
 * search result should see the car they came for, not a question blocking it —
 * that is the most expensive possible moment to interrupt them.
 *
 * It only appears when there is something worth saying: the browser asks for a
 * language we support, and it is not the one currently being shown. Someone
 * whose phone is already set to Kinyarwanda gets Kinyarwanda silently and never
 * sees this. The case it exists for is the common one — a Rwandan user whose
 * phone is set to English, where Accept-Language is technically right and
 * practically wrong.
 *
 * Dismissing writes the cookie, so it never returns. The navbar switcher is the
 * permanent way back.
 */

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { X } from "lucide-react";
import { routing, LOCALE_LABELS, type Locale } from "@/i18n/routing";
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

    // navigator.languages is ordered by preference: take the first that we
    // actually support, so "rw-RW, en-US" suggests Kinyarwanda rather than
    // stopping at the first entry we happen to recognise.
    const preferred = navigator.languages
      .map((l) => l.split("-")[0].toLowerCase())
      .find((l) => (routing.locales as readonly string[]).includes(l)) as
      | Locale
      | undefined;

    // Nothing to offer if they already have what they asked for.
    if (preferred && preferred !== locale) setSuggest(preferred);
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
          const rest = pathname.replace(
            new RegExp(`^/(${routing.locales.join("|")})`),
            "",
          );
          router.replace(`/${suggest}${rest || ""}`);
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
