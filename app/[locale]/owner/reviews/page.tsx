/**
 * /owner/reviews — reviews across the owner's fleet
 *
 * Owners can reply once per review. Replies are their only channel here —
 * they cannot edit or remove a review; that's a Content Moderator action.
 */

import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireOwnerProfile } from "@/lib/owner";
import { formatDate } from "@/lib/dates";
import ReviewReplyForm from "@/components/owner/ReviewReplyForm";
import { Star, MessageSquare } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "owner" });
  return { title: `${t("reviews")} — ZuriDrive` };
}

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

export default async function OwnerReviewsPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "owner" });
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
        <h1 className="text-xl font-bold text-ink">{t("reviews")}</h1>
        <p className="text-sm text-ink-soft">{t("reviewsSub")}</p>
      </div>

      {reviews.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-white p-4 shadow-sm">
          <div>
            <p className="text-2xl font-bold text-ink">{avg!.toFixed(2)}</p>
            <Stars value={avg!} />
          </div>
          <div className="text-xs text-ink-soft">
            <p>{t("reviewCount", { count: reviews.length })}</p>
            {unanswered > 0 && (
              <p className="mt-0.5 font-semibold text-warning-dark">
                {t("awaitingYourReply", { count: unanswered })}
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
            {t("noReviewsYet")}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">{t("reviewsEmptyHint")}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {r.client.name ?? t("zuriDriveRenter")}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {r.car.year} {r.car.make} {r.car.model} ·{" "}
                    {formatDate(r.createdAt, params.locale)}
                  </p>
                </div>
                <Stars value={r.overallRating} />
              </div>

              {r.comment && (
                <p className="mt-2 text-sm text-ink-muted">{r.comment}</p>
              )}

              <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-sand pt-3 text-center">
                {(
                  [
                    ["ratingClean", r.cleanlinessRating],
                    ["ratingComfort", r.comfortRating],
                    ["ratingValue", r.valueRating],
                    ["ratingComms", r.communicationRating],
                  ] as [string, number][]
                ).map(([labelKey, val]) => (
                  <div key={labelKey}>
                    <dt className="text-[10px] text-ink-faint">
                      {t(labelKey)}
                    </dt>
                    <dd className="text-sm font-semibold text-ink">{val}</dd>
                  </div>
                ))}
              </dl>

              {r.reply ? (
                <div className="mt-3 rounded-xl bg-bone p-3">
                  <p className="text-xs font-semibold text-ink">
                    {t("yourReply")}
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
