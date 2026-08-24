/**
 * /admin/disputes — dispute queue
 *
 * Sorted oldest-first within the open set: a client's deposit is frozen for as
 * long as a dispute is open, so age is the thing that matters most.
 */

import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { getEnumLabeller } from "@/lib/enum-labels";
import { requireAdminModule } from "@/lib/auth";
import { formatMoney } from "@/lib/currency";
import {
  PageHeader,
  StatCard,
  Card,
  Badge,
  EmptyRow,
  SubNav,
} from "@/components/admin/ui";
import { Scale, ArrowRight, Clock } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  return { title: `${t("disputes")} — ZuriDrive Admin` };
}

function daysOpen(from: Date) {
  return Math.floor((Date.now() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export default async function AdminDisputesPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { status?: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  const label = await getEnumLabeller(params.locale);
  await requireAdminModule("BOOKING_MANAGER");

  const filter = searchParams.status ?? "OPEN";

  const [disputes, counts, frozen] = await Promise.all([
    prisma.dispute.findMany({
      where:
        filter === "ALL"
          ? {}
          : filter === "OPEN"
            ? { status: { in: ["OPEN", "UNDER_REVIEW"] } }
            : { status: filter },
      include: {
        resolution: true,
        booking: {
          select: {
            id: true,
            reference: true,
            client: { select: { name: true } },
            deposit: { select: { amount: true, status: true } },
            car: {
              select: {
                make: true,
                model: true,
                owner: { select: { user: { select: { name: true } } } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    prisma.dispute.groupBy({ by: ["status"], _count: true }),
    // Deposit value frozen behind unresolved disputes
    prisma.deposit.aggregate({
      _sum: { amount: true },
      where: {
        status: "HELD",
        booking: { dispute: { status: { in: ["OPEN", "UNDER_REVIEW"] } } },
      },
    }),
  ]);

  const countFor = (s: string) =>
    counts.find((c) => c.status === s)?._count ?? 0;
  const openCount = countFor("OPEN") + countFor("UNDER_REVIEW");

  const oldest = disputes
    .filter((d) => !d.resolution)
    .reduce<number>((max, d) => Math.max(max, daysOpen(d.createdAt)), 0);

  return (
    <div>
      <PageHeader
        title={t("disputes")}
        subtitle={t("disputesSub")}
      />

      <SubNav
        active={`/admin/disputes?status=${filter}`}
        items={[
          {
            label: t("open"),
            href: "/admin/disputes?status=OPEN",
            count: openCount,
          },
          { label: t("resolved"), href: "/admin/disputes?status=RESOLVED" },
          { label: t("dismissed"), href: "/admin/disputes?status=DISMISSED" },
          { label: t("all"), href: "/admin/disputes?status=ALL" },
        ]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t("openDisputes")}
          value={openCount}
          tone={openCount > 0 ? "danger" : "default"}
        />
        <StatCard
          label={t("depositsFrozen")}
          value={formatMoney(frozen._sum.amount ?? 0)}
          hint={t("depositsFrozenHint")}
          tone={frozen._sum.amount ? "warn" : "default"}
        />
        <StatCard
          label={t("oldestOpen")}
          value={oldest > 0 ? `${oldest}d` : "—"}
          tone={oldest > 7 ? "danger" : "default"}
        />
        <StatCard label={t("resolved")} value={countFor("RESOLVED")} />
      </div>

      <Card title={t("disputesCount", { count: disputes.length })}>
        {disputes.length === 0 ? (
          <EmptyRow>
            {filter === "OPEN"
              ? t("noOpenDisputes")
              : t("nothingMatchesFilter")}
          </EmptyRow>
        ) : (
          <ul className="divide-y divide-sand">
            {disputes.map((d) => {
              const age = daysOpen(d.createdAt);
              const unresolved = !d.resolution;
              return (
                <li key={d.id}>
                  <Link
                    href={`/admin/disputes/${d.id}`}
                    className="flex items-start gap-3 py-3 hover:opacity-80"
                  >
                    <div
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        unresolved ? "bg-danger-bg" : "bg-sand"
                      }`}
                    >
                      <Scale
                        className={`h-4 w-4 ${
                          unresolved ? "text-danger" : "text-ink-soft"
                        }`}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink">
                          {label("disputeType", d.type)}
                        </span>
                        <Badge
                          tone={
                            d.status === "RESOLVED"
                              ? "success"
                              : d.status === "DISMISSED"
                                ? "neutral"
                                : "danger"
                          }
                        >
                          {label("disputeStatus", d.status)}
                        </Badge>
                        {unresolved && age > 3 && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-danger-strong">
                            <Clock className="h-2.5 w-2.5" />
                            {t("daysOpen", { count: age })}
                          </span>
                        )}
                      </div>

                      <p className="mt-0.5 line-clamp-1 text-xs text-ink-soft">
                        {d.description}
                      </p>
                      <p className="text-[11px] text-ink-faint">
                        {d.booking.reference} · {d.booking.car.make}{" "}
                        {d.booking.car.model} ·{" "}
                        {t("versus", {
                          client: d.booking.client.name ?? t("clientFallback"),
                          owner:
                            d.booking.car.owner.user.name ?? t("ownerFallback"),
                        })}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-ink">
                        {formatMoney(d.booking.deposit?.amount ?? 0)}
                      </p>
                      <p className="text-[10px] text-ink-faint">
                        {t("depositLabel")}
                      </p>
                    </div>

                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-ink-faint" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
