# ZuriDrive

## Text and translations

Every user-facing string lives in `messages/*.json`, not in components. If you
are adding text a person will read, add a key there and reference it.

- `messages/en.json` is the source and must stay complete — it is the fallback,
  and missing keys in other locales resolve to it per key.
- `messages/rw.json`, `sw.json`, `fr.json` may be partial.
- Database enums (car category, fuel type, fuel policy) are translated too, via
  `lib/enum-labels.ts` — you cannot derive "Esansi" from `PETROL`.
- Server components must pass the locale explicitly:
  `getTranslations({ locale: params.locale, namespace })`. Without it they
  resolve a locale of their own and render English inside a translated page.

Adding a hardcoded string is the easy mistake, and it is invisible until someone
reads the page in another language.
