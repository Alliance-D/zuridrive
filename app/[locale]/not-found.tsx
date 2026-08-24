/**
 * app/not-found.tsx — the 404 page.
 *
 * There wasn't one, so a mistyped or expired URL fell through to Next.js's
 * built-in screen: the bare string "404 | This page could not be found" on a
 * white background, with no navigation and no way back into the site.
 *
 * It now shows real cars rather than only apologising. Most 404s here are a
 * delisted car or a stale link from a search result or a shared message —
 * someone who wanted to rent a car and landed on nothing. Offering a few
 * available ones turns a dead end into the thing they came for.
 */

import { Link } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import CarCardGrid from "@/components/car-card-grid";
import { getSuggestedCars } from "@/lib/car-card";
import { ROUTES } from "@/lib/routes";

export const metadata = {
  title: "Page not found — ZuriDrive",
};

export default async function NotFound() {
  // Next does not pass params to not-found.tsx, so the locale has to be read
  // from the request rather than from the route segment. This is the one place
  // an explicit locale argument isn't available.
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "notFound" });
  // A 404 must never itself fail. If the database is unreachable the page still
  // has to render — just without suggestions.
  let cars: Awaited<ReturnType<typeof getSuggestedCars>> = [];
  try {
    cars = await getSuggestedCars(3);
  } catch {
    cars = [];
  }

  return (
    <div className="flex min-h-screen flex-col bg-bone">
      <Navbar />

      <main className="flex-1 px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <p className="label mb-4 block text-brand">◆ {t("eyebrow")}</p>

            <h1 className="mb-4 font-display text-fluid-3xl font-normal leading-[1.1] tracking-[-0.03em] text-ink">
              {t("title")}
            </h1>

            <p className="mx-auto mb-8 max-w-[46ch] text-fluid-base leading-[1.7] text-ink-soft">
              {t("body")}
            </p>

            <div className="flex flex-wrap justify-center gap-3">
              <Link href={ROUTES.cars} className="btn btn-primary btn-lg">
                {t("browseAll")}
              </Link>
              <Link href={ROUTES.home} className="btn btn-secondary btn-lg">
                {t("goHome")}
              </Link>
            </div>
          </div>

          {cars.length > 0 && (
            <section className="mt-16">
              <h2 className="mb-6 text-center font-sans text-fluid-lg font-bold tracking-[-0.01em] text-ink">
                {t("availableNow")}
              </h2>
              <CarCardGrid cars={cars} locale={locale} />
            </section>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
