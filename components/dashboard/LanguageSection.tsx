"use client";

/**
 * The language this account is written to in.
 *
 * Distinct from the switcher in the navbar, which changes the page you are
 * looking at right now. This is the stored preference on the account, and it
 * is what decides the language of an SMS — a message sent by a cron job at 3am
 * has no browser to read a cookie from, only the user record.
 *
 * Changing it here does both: it saves the preference and moves the page, so
 * the two never disagree.
 */

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { Globe, Loader2, Check } from "lucide-react";
import { routing, LOCALE_LABELS, type Locale } from "@/i18n/routing";
import { LOCALE_COOKIE, LANG_ASKED_COOKIE } from "@/lib/locale-cookie";

export default function LanguageSection({ saved }: { saved: string }) {
  const t = useTranslations("dashboard");
  const active = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();

  const [choice, setChoice] = useState<Locale>(
    (routing.locales as readonly string[]).includes(saved)
      ? (saved as Locale)
      : active,
  );
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  async function apply(next: Locale) {
    setChoice(next);
    setDone(false);
    setBusy(true);

    // Cookie first, so the redirect below lands in the right language even if
    // the write is slow.
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
    document.cookie = `${LANG_ASKED_COOKIE}=1;path=/;max-age=31536000;samesite=lax`;

    try {
      await fetch("/api/me/locale", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      setDone(true);
    } catch {
      // The cookie still applied, so the page follows even if the save failed.
    } finally {
      setBusy(false);
    }

    const rest = pathname.replace(
      new RegExp(`^/(${routing.locales.join("|")})`),
      "",
    );
    startTransition(() => router.replace(`/${next}${rest || ""}`));
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-sand-dark">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
        <Globe className="h-4 w-4 text-ink-faint" />
        {t("languageTitle")}
      </h3>
      <p className="mb-4 text-xs text-ink-soft">{t("languageHint")}</p>

      <div className="flex flex-wrap gap-2">
        {routing.locales.map((l) => {
          const selected = l === choice;
          return (
            <button
              key={l}
              onClick={() => apply(l)}
              disabled={busy || pending}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                selected
                  ? "border-brand bg-brand text-white"
                  : "border-sand-dark bg-white text-ink-muted hover:border-brand"
              }`}
            >
              {LOCALE_LABELS[l]}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs">
        {(busy || pending) && (
          <span className="flex items-center gap-1.5 text-ink-faint">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          </span>
        )}
        {done && !busy && !pending && (
          <span className="flex items-center gap-1.5 text-success-strong">
            <Check className="h-3.5 w-3.5" /> {t("languageSaved")}
          </span>
        )}
      </div>
    </section>
  );
}
