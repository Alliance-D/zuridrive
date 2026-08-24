/**
 * /dashboard/bookings/[id]/review — leave a review
 *
 * Only the client on the booking, only after it's COMPLETED, and only once.
 * Each of those is checked here and again in the API.
 */

import { notFound, redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { routes } from "@/lib/routes";
import { getTranslations } from "next-intl/server";
import { loginPath } from "@/lib/navigation";
import ReviewForm from "@/components/reviews/ReviewForm";
import { ChevronLeft, Star, CheckCircle2 } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "review" });
  return { title: `${t("pageTitle")} — ZuriDrive` };
}

export default async function ReviewPage({
  params,
}: {
  params: { id: string; locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "review" });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect(await loginPath(`/dashboard/bookings/${params.id}/review`));
  }

  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      reference: true,
      status: true,
      clientId: true,
      tripEndedAt: true,
      car: { select: { make: true, model: true, year: true } },
      review: { select: { id: true } },
    },
  });

  if (!booking) notFound();

  // Only the client who took the trip can review it.
  if (booking.clientId !== session.user.id) notFound();

  const carName = `${booking.car.year} ${booking.car.make} ${booking.car.model}`;

  // Already reviewed — show that rather than a form that would 409.
  if (booking.review) {
    return (
      <Shell bookingId={booking.id} backLabel={t("backToBooking")}>
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg">
            <CheckCircle2 className="h-5 w-5 text-success" />
          </div>
          <h1 className="text-base font-semibold text-ink">
            {t("alreadyReviewed")}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {t("reviewLive", { car: carName })}
          </p>
          <Link
            href={routes.bookingDetail(booking.id)}
            className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            {t("backToBooking")}
          </Link>
        </div>
      </Shell>
    );
  }

  // Not finished yet.
  if (booking.status !== "COMPLETED") {
    return (
      <Shell bookingId={booking.id} backLabel={t("backToBooking")}>
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sand">
            <Star className="h-5 w-5 text-ink-faint" />
          </div>
          <h1 className="text-base font-semibold text-ink">
            {t("tripNotFinished")}
          </h1>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
            You can leave a review once the trip is complete and both you and
            the owner have confirmed the car was returned.
          </p>
          <Link
            href={routes.bookingDetail(booking.id)}
            className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            {t("backToBooking")}
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell bookingId={booking.id} backLabel={t("backToBooking")}>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-ink">{t("pageTitle")}</h1>
        <p className="text-sm text-ink-soft">
          {booking.reference}
          {booking.tripEndedAt &&
            ` · trip ended ${booking.tripEndedAt.toLocaleDateString("en-RW")}`}
        </p>
      </div>
      <ReviewForm bookingId={booking.id} carName={carName} />
    </Shell>
  );
}

// Module-level, so it cannot hold a hook and is not the async component that
// could await getTranslations. The label comes in already translated.
function Shell({
  bookingId,
  backLabel,
  children,
}: {
  bookingId: string;
  backLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bone">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link
          href={routes.bookingDetail(bookingId)}
          className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-ink"
        >
          <ChevronLeft className="h-3 w-3" />
          {backLabel}
        </Link>
        {children}
      </div>
    </div>
  );
}
