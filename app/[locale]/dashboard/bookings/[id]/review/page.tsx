/**
 * /dashboard/bookings/[id]/review — leave a review
 *
 * Only the client on the booking, only after it's COMPLETED, and only once.
 * Each of those is checked here and again in the API.
 */

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { routes } from "@/lib/routes";
import ReviewForm from "@/components/reviews/ReviewForm";
import { ChevronLeft, Star, CheckCircle2 } from "lucide-react";

export const metadata = { title: "Leave a review — ZuriDrive" };

export default async function ReviewPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect(`/login?next=/dashboard/bookings/${params.id}/review`);
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
      <Shell bookingId={booking.id}>
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg">
            <CheckCircle2 className="h-5 w-5 text-success" />
          </div>
          <h1 className="text-base font-semibold text-ink">
            You&apos;ve already reviewed this trip
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Thanks — your review is live on the {carName} listing.
          </p>
          <Link
            href={routes.bookingDetail(booking.id)}
            className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Back to booking
          </Link>
        </div>
      </Shell>
    );
  }

  // Not finished yet.
  if (booking.status !== "COMPLETED") {
    return (
      <Shell bookingId={booking.id}>
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sand">
            <Star className="h-5 w-5 text-ink-faint" />
          </div>
          <h1 className="text-base font-semibold text-ink">
            This trip isn&apos;t finished yet
          </h1>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
            You can leave a review once the trip is complete and both you and
            the owner have confirmed the car was returned.
          </p>
          <Link
            href={routes.bookingDetail(booking.id)}
            className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Back to booking
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell bookingId={booking.id}>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-ink">Leave a review</h1>
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

function Shell({
  bookingId,
  children,
}: {
  bookingId: string;
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
          Back to booking
        </Link>
        {children}
      </div>
    </div>
  );
}
