/**
 * /admin — console overview
 *
 * Every figure is a live count. The queues at the top are the things that
 * actually block someone: an owner waiting on a payout, a client waiting on a
 * bank confirmation, a car waiting for approval.
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/currency";
import { PageHeader, StatCard, Card, EmptyRow } from "@/components/admin/ui";
import { ArrowRight, AlertTriangle } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  return { title: `${t("admin")} — ZuriDrive` };
}

export default async function AdminOverviewPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    userCount,
    newUsersThisWeek,
    liveCars,
    pendingCars,
    activeBookings,
    openDisputes,
    pendingPayouts,
    pendingBankPayments,
    depositsHeld,
    monthRevenue,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: {
        createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.car.count({ where: { status: "LIVE", isActive: true } }),
    prisma.car.count({ where: { status: "PENDING_APPROVAL" } }),
    prisma.booking.count({ where: { status: "ACTIVE" } }),
    prisma.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
    prisma.payout.count({ where: { status: "PENDING_REQUEST" } }),
    prisma.payment.count({
      where: {
        method: "BANK_TRANSFER",
        status: "PENDING",
        proofUrl: { not: null },
        isVoided: false,
      },
    }),
    prisma.deposit.aggregate({
      _sum: { amount: true },
      where: { status: "HELD" },
    }),
    // Platform revenue = commission on completed trips this month
    prisma.commission.aggregate({
      _sum: { commissionAmount: true },
      where: {
        booking: { status: "COMPLETED", tripEndedAt: { gte: monthStart } },
      },
    }),
  ]);

  // Keys, not text — resolved at render below.
  const queues = [
    {
      labelKey: "queueBankTransfers",
      count: pendingBankPayments,
      href: "/admin/finance/payments",
    },
    {
      labelKey: "queuePayouts",
      count: pendingPayouts,
      href: "/admin/finance/payouts",
    },
    { labelKey: "queueCarsApproval", count: pendingCars, href: "/admin/fleet" },
    { labelKey: "queueDisputes", count: openDisputes, href: "/admin/disputes" },
  ];

  const totalQueued = queues.reduce((s, q) => s + q.count, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("overview")}
        subtitle={t("overviewSub")}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t("commissionThisMonth")}
          value={formatMoney(monthRevenue._sum.commissionAmount ?? 0)}
          tone="dark"
        />
        <StatCard
          label={t("depositsHeld")}
          value={formatMoney(depositsHeld._sum.amount ?? 0)}
          hint={t("depositsHeldHint")}
        />
        <StatCard
          label={t("usersStat")}
          value={userCount}
          hint={t("newThisWeek", { count: newUsersThisWeek })}
        />
        <StatCard
          label={t("carsLive")}
          value={liveCars}
          hint={
            pendingCars > 0
              ? t("awaitingApprovalHint", { count: pendingCars })
              : undefined
          }
        />
      </div>

      <Card title={t("needsAttention")}>
        {totalQueued === 0 ? (
          <EmptyRow>{t("allQueuesClear")}</EmptyRow>
        ) : (
          <ul className="divide-y divide-sand">
            {queues
              .filter((q) => q.count > 0)
              .map((q) => (
                <li key={q.href}>
                  <Link
                    href={q.href}
                    className="flex items-center gap-3 py-2.5 hover:opacity-80"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0 text-accent" />
                    <span className="flex-1 text-sm text-ink">
                      {t(q.labelKey)}
                    </span>
                    <span className="rounded-full bg-warning-tint px-2 py-0.5 text-xs font-bold text-warning-dark">
                      {q.count}
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                  </Link>
                </li>
              ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label={t("activeTrips")} value={activeBookings} />
        <StatCard
          label={t("openDisputes")}
          value={openDisputes}
          tone={openDisputes > 0 ? "danger" : "default"}
        />
      </div>
    </div>
  );
}
