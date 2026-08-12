/**
 * /admin/reviews — review moderation
 *
 * Low ratings are surfaced as a separate tab. A 1- or 2-star review is not a
 * violation and must not be removed for being negative — but it is worth
 * reading, because it's often the first sign of a problem with a car or owner.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdminModule } from "@/lib/auth";
import {
  PageHeader,
  StatCard,
  Card,
  Badge,
  EmptyRow,
  SubNav,
} from "@/components/admin/ui";
import ModerationActions from "@/components/admin/ModerationActions";
import type { Prisma } from "@prisma/client";
import { Star, Search, EyeOff } from "lucide-react";

export const metadata = { title: "Reviews — ZuriDrive Admin" };

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

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: { filter?: string; q?: string };
}) {
  await requireAdminModule("CONTENT_MODERATOR");

  const filter = searchParams.filter ?? "ALL";
  const q = searchParams.q?.trim() ?? "";

  const where: Prisma.ReviewWhereInput = {
    ...(filter === "HIDDEN" ? { isVisible: false } : {}),
    ...(filter === "LOW" ? { isVisible: true, overallRating: { lte: 2 } } : {}),
    ...(filter === "ALL" ? { isVisible: true } : {}),
    ...(q
      ? {
          OR: [
            { comment: { contains: q, mode: "insensitive" } },
            { client: { name: { contains: q, mode: "insensitive" } } },
            { car: { make: { contains: q, mode: "insensitive" } } },
            { car: { model: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [reviews, visibleCount, hiddenCount, lowCount, avg] = await Promise.all([
    prisma.review.findMany({
      where,
      include: {
        client: { select: { name: true } },
        car: {
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            owner: { select: { user: { select: { name: true } } } },
          },
        },
        reply: { include: { author: { select: { name: true } } } },
        booking: { select: { id: true, reference: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.review.count({ where: { isVisible: true } }),
    prisma.review.count({ where: { isVisible: false } }),
    prisma.review.count({
      where: { isVisible: true, overallRating: { lte: 2 } },
    }),
    prisma.review.aggregate({
      _avg: { overallRating: true },
      where: { isVisible: true },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Reviews"
        subtitle="Hide reviews that break the rules — not ones that are simply negative. Hiding is reversible; nothing is deleted."
      />

      <SubNav
        active={`/admin/reviews?filter=${filter}`}
        items={[
          { label: "Published", href: "/admin/reviews?filter=ALL" },
          {
            label: "Low ratings",
            href: "/admin/reviews?filter=LOW",
            count: lowCount,
          },
          {
            label: "Hidden",
            href: "/admin/reviews?filter=HIDDEN",
            count: hiddenCount,
          },
        ]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Published" value={visibleCount} tone="dark" />
        <StatCard
          label="Average rating"
          value={avg._avg.overallRating?.toFixed(2) ?? "—"}
        />
        <StatCard
          label="Low ratings (≤2)"
          value={lowCount}
          tone={lowCount > 0 ? "warn" : "default"}
        />
        <StatCard label="Hidden" value={hiddenCount} />
      </div>

      <form className="mb-4" action="/admin/reviews">
        <input type="hidden" name="filter" value={filter} />
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search review text, reviewer or car…"
            className="w-full rounded-lg border border-sand-dark bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>
      </form>

      <div className="mb-4 rounded-2xl bg-bone p-3">
        <p className="text-xs text-ink-soft">
          <strong className="text-ink">Moderation rule:</strong> hide a
          review only for abuse, personal information, spam or something plainly
          untrue. A harsh but honest review stays up — hiding those makes every
          rating on the platform worthless.
        </p>
      </div>

      <Card title={`Reviews (${reviews.length})`}>
        {reviews.length === 0 ? (
          <EmptyRow>
            {q ? `Nothing matches “${q}”.` : "No reviews in this view."}
          </EmptyRow>
        ) : (
          <ul className="divide-y divide-sand">
            {reviews.map((r) => (
              <li key={r.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Stars value={r.overallRating} />
                      <span className="text-sm font-semibold text-ink">
                        {r.overallRating.toFixed(2)}
                      </span>
                      {!r.isVisible && (
                        <Badge tone="danger">
                          <span className="inline-flex items-center gap-1">
                            <EyeOff className="h-2.5 w-2.5" />
                            hidden
                          </span>
                        </Badge>
                      )}
                      {r.isVisible && r.overallRating <= 2 && (
                        <Badge tone="warn">low rating</Badge>
                      )}
                    </div>

                    <p className="mt-1 text-xs text-ink-soft">
                      {r.client.name ?? "Client"} on{" "}
                      <Link
                        href={`/cars/${r.car.id}`}
                        className="hover:text-brand"
                      >
                        {r.car.year} {r.car.make} {r.car.model}
                      </Link>{" "}
                      · owner {r.car.owner.user.name ?? "—"} ·{" "}
                      <Link
                        href={`/admin/bookings/${r.booking.id}`}
                        className="hover:text-brand"
                      >
                        {r.booking.reference}
                      </Link>{" "}
                      · {r.createdAt.toLocaleDateString("en-RW")}
                    </p>

                    {r.comment && (
                      <p className="mt-2 rounded-lg bg-bone p-2.5 text-sm text-ink-muted">
                        {r.comment}
                      </p>
                    )}

                    <dl className="mt-2 flex flex-wrap gap-3 text-[11px] text-ink-faint">
                      <span>Clean {r.cleanlinessRating}</span>
                      <span>Comfort {r.comfortRating}</span>
                      <span>Value {r.valueRating}</span>
                      <span>Comms {r.communicationRating}</span>
                    </dl>

                    {r.reply && (
                      <div className="mt-2 rounded-lg border-l-2 border-brand bg-white pl-2.5">
                        <p className="text-[11px] font-semibold text-ink">
                          {r.reply.author.name ?? "Owner"} replied
                        </p>
                        <p className="text-xs text-ink-muted">
                          {r.reply.content}
                        </p>
                      </div>
                    )}

                    {!r.isVisible && r.removedReason && (
                      <p className="mt-2 rounded-lg bg-danger-bg px-2.5 py-1.5 text-[11px] text-danger">
                        Hidden: {r.removedReason}
                      </p>
                    )}
                  </div>

                  <div className="w-full lg:w-auto">
                    <ModerationActions
                      endpoint={`/api/admin/reviews/${r.id}`}
                      actions={
                        r.isVisible
                          ? [
                              {
                                id: "remove",
                                label: "Hide",
                                tone: "danger" as const,
                                needsReason: true,
                                reasonPlaceholder:
                                  "Which rule does this break?",
                                warning:
                                  "The reviewer is told why. Hiding is reversible — but don't hide a review just for being negative.",
                              },
                            ]
                          : [
                              {
                                id: "restore",
                                label: "Restore",
                                tone: "primary" as const,
                              },
                            ]
                      }
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
