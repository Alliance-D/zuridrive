/**
 * /owner/reviews — reviews across the owner's fleet
 *
 * Owners can reply once per review. Replies are their only channel here —
 * they cannot edit or remove a review; that's a Content Moderator action.
 */

import { prisma } from "@/lib/db";
import { requireOwnerProfile } from "@/lib/owner";
import ReviewReplyForm from "@/components/owner/ReviewReplyForm";
import { Star, MessageSquare } from "lucide-react";

export const metadata = { title: "Reviews — ZuriDrive" };

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`h-3 w-3 ${
            s <= Math.round(value)
              ? "fill-accent text-accent"
              : "text-sand-dark"
          }`}
        />
      ))}
    </span>
  );
}

export default async function OwnerReviewsPage() {
  const { profile } = await requireOwnerProfile();

  const reviews = await prisma.review.findMany({
    where: { car: { ownerId: profile.id }, isVisible: true },
    include: {
      car: { select: { make: true, model: true, year: true } },
      client: { select: { name: true } },
      reply: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const avg =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + r.overallRating, 0) / reviews.length
      : null;

  const unanswered = reviews.filter((r) => !r.reply).length;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink">Reviews</h1>
        <p className="text-sm text-ink-soft">
          What clients said after their trips.
        </p>
      </div>

      {reviews.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-white p-4 shadow-sm">
          <div>
            <p className="text-2xl font-bold text-ink">
              {avg!.toFixed(2)}
            </p>
            <Stars value={avg!} />
          </div>
          <div className="text-xs text-ink-soft">
            <p>
              {reviews.length} review{reviews.length === 1 ? "" : "s"}
            </p>
            {unanswered > 0 && (
              <p className="mt-0.5 font-semibold text-warning-dark">
                {unanswered} awaiting your reply
              </p>
            )}
          </div>
        </div>
      )}

      {reviews.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sand">
            <MessageSquare className="h-5 w-5 text-ink-faint" />
          </div>
          <h2 className="text-base font-semibold text-ink">
            No reviews yet
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Clients are invited to review once a trip completes.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {r.client.name ?? "ZuriDrive renter"}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {r.car.year} {r.car.make} {r.car.model} ·{" "}
                    {r.createdAt.toLocaleDateString("en-RW")}
                  </p>
                </div>
                <Stars value={r.overallRating} />
              </div>

              {r.comment && (
                <p className="mt-2 text-sm text-ink-muted">{r.comment}</p>
              )}

              <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-sand pt-3 text-center">
                {[
                  ["Clean", r.cleanlinessRating],
                  ["Comfort", r.comfortRating],
                  ["Value", r.valueRating],
                  ["Comms", r.communicationRating],
                ].map(([label, val]) => (
                  <div key={label as string}>
                    <dt className="text-[10px] text-ink-faint">{label}</dt>
                    <dd className="text-sm font-semibold text-ink">
                      {val as number}
                    </dd>
                  </div>
                ))}
              </dl>

              {r.reply ? (
                <div className="mt-3 rounded-xl bg-bone p-3">
                  <p className="text-xs font-semibold text-ink">
                    Your reply
                  </p>
                  <p className="mt-1 text-sm text-ink-muted">
                    {r.reply.content}
                  </p>
                </div>
              ) : (
                <div className="mt-3 border-t border-sand pt-3">
                  <ReviewReplyForm reviewId={r.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
