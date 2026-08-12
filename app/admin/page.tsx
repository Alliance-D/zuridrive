/**
 * /admin — console overview
 *
 * Every figure is a live count. The queues at the top are the things that
 * actually block someone: an owner waiting on a payout, a client waiting on a
 * bank confirmation, a car waiting for approval.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatRWF } from "@/lib/currency";
import { PageHeader, StatCard, Card, EmptyRow } from "@/components/admin/ui";
import { ArrowRight, AlertTriangle } from "lucide-react";

export const metadata = { title: "Admin — ZuriDrive" };

export default async function AdminOverviewPage() {
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

  const queues = [
    {
      label: "Bank transfers to confirm",
      count: pendingBankPayments,
      href: "/admin/finance/payments",
    },
    {
      label: "Payout requests",
      count: pendingPayouts,
      href: "/admin/finance/payouts",
    },
    { label: "Cars awaiting approval", count: pendingCars, href: "/admin/fleet" },
    { label: "Open disputes", count: openDisputes, href: "/admin/disputes" },
  ];

  const totalQueued = queues.reduce((s, q) => s + q.count, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Overview"
        subtitle="Platform health and anything waiting on the team."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Commission this month"
          value={formatRWF(monthRevenue._sum.commissionAmount ?? 0)}
          tone="dark"
        />
        <StatCard
          label="Deposits held"
          value={formatRWF(depositsHeld._sum.amount ?? 0)}
          hint="Client money — not platform revenue"
        />
        <StatCard
          label="Users"
          value={userCount}
          hint={`+${newUsersThisWeek} this week`}
        />
        <StatCard
          label="Cars live"
          value={liveCars}
          hint={pendingCars > 0 ? `${pendingCars} awaiting approval` : undefined}
        />
      </div>

      <Card title="Needs attention">
        {totalQueued === 0 ? (
          <EmptyRow>Nothing is waiting. All queues are clear.</EmptyRow>
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
                      {q.label}
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
        <StatCard label="Active trips" value={activeBookings} />
        <StatCard
          label="Open disputes"
          value={openDisputes}
          tone={openDisputes > 0 ? "danger" : "default"}
        />
      </div>
    </div>
  );
}
