/**
 * /admin/finance/commissions — commission ledger
 *
 * One row per booking, written at creation and never recalculated. The rate
 * column is the rate that applied at the time, which is why changing the
 * platform rate later can't rewrite history.
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { getEnumLabeller } from "@/lib/enum-labels";
import { requireAdminModule } from "@/lib/auth";
import { formatRWF } from "@/lib/currency";
import { FinanceNav } from "../nav";
import {
  PageHeader,
  StatCard,
  Card,
  Badge,
  EmptyRow,
  TableWrap,
  Th,
  Td,
} from "@/components/admin/ui";
import { Download } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "finance" });
  return { title: `${t("navCommission")} — ZuriDrive Admin` };
}

export default async function AdminCommissionsPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "finance" });
  const label = await getEnumLabeller(params.locale);
  await requireAdminModule("FINANCE_MANAGER");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [rows, lifetime, thisMonth, lastMonth, realised] = await Promise.all([
    prisma.commission.findMany({
      include: {
        booking: {
          select: {
            id: true,
            reference: true,
            status: true,
            tripEndedAt: true,
            createdAt: true,
            client: { select: { name: true } },
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
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.commission.aggregate({
      _sum: { commissionAmount: true, baseAmount: true, netOwnerAmount: true },
    }),
    prisma.commission.aggregate({
      _sum: { commissionAmount: true },
      where: { booking: { status: "COMPLETED", tripEndedAt: { gte: monthStart } } },
    }),
    prisma.commission.aggregate({
      _sum: { commissionAmount: true },
      where: {
        booking: {
          status: "COMPLETED",
          tripEndedAt: { gte: lastMonthStart, lt: monthStart },
        },
      },
    }),
    // Only completed trips are money the platform has actually earned.
    prisma.commission.aggregate({
      _sum: { commissionAmount: true },
      where: { booking: { status: "COMPLETED" } },
    }),
  ]);

  const current = thisMonth._sum.commissionAmount ?? 0;
  const previous = lastMonth._sum.commissionAmount ?? 0;
  const delta = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;

  return (
    <div>
      <PageHeader
        title={t("navCommission")}
        subtitle={t("commissionSub")}
        action={
          <a
            href="/api/admin/finance/export?type=commissions"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-sand-dark bg-white px-3 py-2 text-sm font-semibold text-ink-muted hover:border-brand hover:text-brand"
          >
            <Download className="h-4 w-4" />
            {t("csv")}
          </a>
        }
      />

      <FinanceNav
        active="/admin/finance/commissions"
        locale={params.locale}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t("thisMonth")}
          value={formatRWF(current)}
          hint={
            delta !== null
              ? `${delta >= 0 ? "+" : ""}${delta}% vs last month`
              : undefined
          }
          tone="dark"
        />
        <StatCard label={t("lastMonth")} value={formatRWF(previous)} />
        <StatCard
          label={t("realised")}
          value={formatRWF(realised._sum.commissionAmount ?? 0)}
        />
        <StatCard
          label={t("booked")}
          value={formatRWF(lifetime._sum.commissionAmount ?? 0)}
          hint="Includes trips not yet completed"
        />
      </div>

      <Card title={t("commissionRecords", { count: rows.length })}>
        {rows.length === 0 ? (
          <EmptyRow>{t("noCommissionYet")}</EmptyRow>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr className="border-b border-sand">
                  <Th>{t("colBooking")}</Th>
                  <Th>{t("colOwner")}</Th>
                  <Th>{t("colCar")}</Th>
                  <Th>{t("colStatus")}</Th>
                  <Th align="right">{t("colCommissionable")}</Th>
                  <Th align="right">{t("colRate")}</Th>
                  <Th align="right">{t("colCommission")}</Th>
                  <Th align="right">{t("colOwnerNet")}</Th>
                  <Th>{t("colDate")}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {rows.map((c) => (
                  <tr key={c.id}>
                    <Td>
                      <Link
                        href={`/admin/bookings/${c.booking.id}`}
                        className="font-medium hover:text-brand"
                      >
                        {c.booking.reference}
                      </Link>
                    </Td>
                    <Td muted>{c.booking.car.owner.user.name ?? "—"}</Td>
                    <Td muted>
                      {c.booking.car.make} {c.booking.car.model}
                    </Td>
                    <Td>
                      <Badge
                        tone={
                          c.booking.status === "COMPLETED"
                            ? "success"
                            : c.booking.status === "CANCELLED"
                              ? "neutral"
                              : "info"
                        }
                      >
                        {label("bookingStatus", c.booking.status)}
                      </Badge>
                    </Td>
                    <Td align="right" muted>
                      {formatRWF(c.baseAmount)}
                    </Td>
                    <Td align="right" muted>
                      {c.rate}%
                    </Td>
                    <Td align="right">
                      <span className="font-semibold text-brand">
                        {formatRWF(c.commissionAmount)}
                      </span>
                    </Td>
                    <Td align="right" muted>
                      {formatRWF(c.netOwnerAmount)}
                    </Td>
                    <Td muted>
                      {formatDate(
                        c.booking.tripEndedAt ?? c.booking.createdAt,
                        params.locale,
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
