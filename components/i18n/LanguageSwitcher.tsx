"use client";

/**
 * Permanent language control, in the navbar.
 *
 * The prompt bar only appears once. Someone who dismissed it, or who changes
 * their mind a week later, needs a way back — and hunting through settings for
 * something as basic as reading the site in your own language is the wrong
 * place to put it.
 *
 * Switching preserves the current path: on /rw/cars/abc you land on
 * /en/cars/abc, not the home page. Being thrown back to the start for changing
 * language is a small thing that feels like the site losing your place.
 */

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { Globe, Check, ChevronDown } from "lucide-react";
import {
  routing,
  LOCALE_LABELS,
  OFFERED_LOCALES,
  type Locale,
} from "@/i18n/routing";
import { LOCALE_COOKIE, LANG_ASKED_COOKIE } from "@/lib/locale-cookie";

export default function LanguageSwitcher({ dark = false }: { dark?: boolean }) {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    // Remember it, so the prompt bar never asks again and a later visit to the
    // bare domain lands in the right language.
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
    // Picking a language here is a choice, so the prompt must not ask later.
    document.cookie = `${LANG_ASKED_COOKIE}=1;path=/;max-age=31536000;samesite=lax`;
    setOpen(false);

    // Also store it against the account, so SMS goes out in this language.
    // Deliberately not awaited: the language change must not wait on a write,
    // and a failure here costs the SMS language, not the switch.
    void fetch("/api/me/locale", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: next }),
    }).catch(() => {});

    // usePathname() from @/i18n/navigation returns the path WITHOUT the locale
    // segment, and its router puts one back. So the path is handed over as-is
    // with the locale named separately — building "/rw/cars" by hand here
    // produced "/en/rw/cars", because both sides were adding a prefix.
    startTransition(() => router.replace(pathname, { locale: next }));
  }

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        aria-label={`Change language. Current: ${LOCALE_LABELS[locale]}`}
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
          dark ? "text-white/85 hover:bg-white/10" : "text-ink-muted hover:bg-sand"
        }`}
      >
        <Globe className="h-4 w-4" />
        <span className="uppercase">{locale}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-sand-dark bg-white py-1 shadow-lg">
          {OFFERED_LOCALES.map((l) => (
            <button
              key={l}
              onClick={() => choose(l)}
              className="flex w-full items-center justify-between px-4 py-2 text-sm text-ink-muted transition-colors hover:bg-bone"
            >
              {LOCALE_LABELS[l]}
              {l === locale && <Check className="h-3.5 w-3.5 text-brand" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
