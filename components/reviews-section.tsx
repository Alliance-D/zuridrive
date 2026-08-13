import { Star } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * Renders a car's reviews plus its per-category rating averages.
 *
 * Prop shapes mirror the Prisma rows the car detail page already loads, so the
 * server component can pass them straight through without a mapping layer.
 */

export interface ReviewItem {
  id: string;
  overallRating: number;
  cleanlinessRating: number;
  comfortRating: number;
  valueRating: number;
  communicationRating: number;
  comment: string | null;
  createdAt: Date | string;
  client: { name: string | null; profilePhoto: string | null };
  reply: {
    content: string;
    createdAt: Date | string;
    author: { name: string | null };
  } | null;
}

export interface AvgRatings {
  overall: number;
  cleanliness: number;
  comfort: number;
  value: number;
  communication: number;
}

interface ReviewsSectionProps {
  /** Threaded down: server components have no ambient locale. */
  locale: string;
  reviews: ReviewItem[];
  avgRatings: AvgRatings | null;
}

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={size}
          fill={s <= Math.round(value) ? "var(--color-accent)" : "none"}
          color={
            s <= Math.round(value) ? "var(--color-accent)" : "var(--color-border)"
          }
        />
      ))}
    </span>
  );
}

function CategoryBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      {/* This read `var(--color-muted)`, which is not a defined variable — the
          declaration was invalid, so the label inherited body colour instead of
          rendering muted. --color-text-muted (ink-soft) is what was meant. */}
      <span className="min-w-[120px] text-[13px] text-ink-soft">
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sand-edge">
        {/* Width is the datum being visualised, so it stays inline. */}
        <div
          className="h-full bg-accent"
          style={{ width: `${(value / 5) * 100}%` }}
        />
      </div>
      <span className="min-w-[28px] text-[13px] font-semibold">
        {value.toFixed(1)}
      </span>
    </div>
  );
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-RW", {
    year: "numeric",
    month: "long",
  });
}

export async function ReviewsSection({
  reviews,
  avgRatings,
  locale,
}: ReviewsSectionProps) {
  const t = await getTranslations({ locale, namespace: "cars" });

  if (reviews.length === 0) {
    return (
      <section className="mt-6">
        <h2 className="mb-3">{t("reviewsHeading")}</h2>
        {/* --color-muted again: undefined, so this fell back to inherited. */}
        <p className="text-[14px] text-ink-soft">
          {t("noReviewsBeFirst")}
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6">
      <h2 className="mb-3">
        Reviews ({reviews.length})
      </h2>

      {avgRatings && (
        <div className="mb-5 grid gap-2">
          <div className="mb-2 flex items-center gap-3">
            <span className="text-[32px] font-bold">
              {avgRatings.overall.toFixed(1)}
            </span>
            <Stars value={avgRatings.overall} size={18} />
          </div>

          <CategoryBar label={t("ratingCleanliness")} value={avgRatings.cleanliness} />
          <CategoryBar label={t("ratingComfort")} value={avgRatings.comfort} />
          <CategoryBar label={t("ratingValue")} value={avgRatings.value} />
          <CategoryBar label={t("ratingCommunication")} value={avgRatings.communication} />
        </div>
      )}

      <div className="grid gap-4">
        {reviews.map((review) => (
          <article
            key={review.id}
            className="border-b border-sand-edge pb-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <div>
                <strong className="text-[14px]">
                  {review.client.name ?? t("zuriDriveRenter")}
                </strong>
                {/* third --color-muted usage; same undefined-variable fallback */}
                <div className="text-[12px] text-ink-soft">
                  {formatDate(review.createdAt)}
                </div>
              </div>
              <Stars value={review.overallRating} />
            </div>

            {review.comment && (
              <p className="text-[14px] leading-[1.6]">{review.comment}</p>
            )}

            {review.reply && (
              <div className="mt-3 rounded-lg bg-sand p-3">
                <strong className="text-[13px]">
                  {t("ownerReplied", { name: review.reply.author.name ?? t("ownerFallback") })}
                </strong>
                <p className="mt-1 text-[13px] leading-[1.6]">
                  {review.reply.content}
                </p>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

// Default export so pages can `import ReviewsSection from "@/components/..."`.
export default ReviewsSection;
