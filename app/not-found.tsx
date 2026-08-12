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

import Link from "next/link";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import CarCardGrid from "@/components/car-card-grid";
import { getSuggestedCars } from "@/lib/car-card";
import { ROUTES } from "@/lib/routes";

export const metadata = {
  title: "Page not found — ZuriDrive",
};

export default async function NotFound() {
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
            <p className="label mb-4 block text-brand">◆ 404</p>

            <h1 className="mb-4 font-display text-fluid-3xl font-normal leading-[1.1] tracking-[-0.03em] text-ink">
              We couldn&apos;t find that page.
            </h1>

            <p className="mx-auto mb-8 max-w-[46ch] text-fluid-base leading-[1.7] text-ink-soft">
              The link may be out of date, or the car may no longer be listed.
              Nothing has gone wrong with your account.
            </p>

            <div className="flex flex-wrap justify-center gap-3">
              <Link href={ROUTES.cars} className="btn btn-primary btn-lg">
                Browse all cars
              </Link>
              <Link href={ROUTES.home} className="btn btn-secondary btn-lg">
                Go home
              </Link>
            </div>
          </div>

          {cars.length > 0 && (
            <section className="mt-16">
              <h2 className="mb-6 text-center font-sans text-fluid-lg font-bold tracking-[-0.01em] text-ink">
                Available right now
              </h2>
              <CarCardGrid cars={cars} />
            </section>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
