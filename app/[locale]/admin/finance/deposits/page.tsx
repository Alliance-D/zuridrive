/**
 * /admin/finance/deposits — deposits ledger
 *
 * Deposits are client money, not platform revenue. This page tracks what's
 * held, what's been returned, and what was withheld — every change backed by a
 * DepositMovement row.
 *
 * Release/withhold actions live under the DEPOSIT_MANAGER module and are
 * handled by /api/deposits/[id]; this ledger is the finance-side view.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
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
import type { DepositStatus } from "@prisma/client";
import { Download } from "lucide-react";

export const metadata = { title: "Deposits — ZuriDrive Admin" };

const TONE: Record<
  DepositStatus,
  "warn" | "success" | "info" | "danger" | "neutral"
> = {
  // Booking created but payment not confirmed — no money collected yet.
  PENDING: "neutral",
  HELD: "warn",
  RELEASED: "success",
  PARTIALLY_WITHHELD: "info",
  FULLY_WITHHELD: "danger",
};

export default async function AdminDepositsPage() {
  await requireAdminModule("DEPOSIT_MANAGER");

  const [deposits, byStatus] = await Promise.all([
    prisma.deposit.findMany({
      include: {
        booking: {
          select: {
            id: true,
            reference: true,
            status: true,
            client: { select: { name: true } },
            car: { select: { make: true, model: true } },
          },
        },
        _count: { select: { movements: true } },
      },
      orderBy: [{ status: "asc" }, { heldAt: "desc" }],
      take: 100,
    }),
    prisma.deposit.groupBy({
      by: ["status"],
      _sum: { amount: true, clientRefundAmount: true, ownerAwardAmount: true },
      _count: true,
    }),
  ]);

  const sumFor = (s: DepositStatus) =>
    byStatus.find((g) => g.status === s)?._sum.amount ?? 0;
  const countFor = (s: DepositStatus) =>
    byStatus.find((g) => g.status === s)?._count ?? 0;

  const withheld = byStatus
    .filter((g) => g.status === "PARTIALLY_WITHHELD" || g.status === "FULLY_WITHHELD")
    .reduce((s, g) => s + (g._sum.ownerAwardAmount ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Deposits"
        subtitle="Damage deposits held on behalf of clients. Never platform revenue."
        action={
          <a
            href="/api/admin/finance/export?type=deposits"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-sand-dark bg-white px-3 py-2 text-sm font-semibold text-ink-muted hover:border-brand hover:text-brand"
          >
            <Download className="h-4 w-4" />
            CSV
          </a>
        }
      />

      <FinanceNav
        active="/admin/finance/deposits"
        counts={{ "/admin/finance/deposits": countFor("HELD") }}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Currently held"
          value={formatRWF(sumFor("HELD"))}
          hint={`${countFor("HELD")} deposit${countFor("HELD") === 1 ? "" : "s"}`}
          tone="dark"
        />
        <StatCard
          label="Released to clients"
          value={formatRWF(sumFor("RELEASED"))}
          hint={`${countFor("RELEASED")} returned in full`}
        />
        <StatCard
          label="Withheld (to owners)"
          value={formatRWF(withheld)}
          hint={`${countFor("PARTIALLY_WITHHELD") + countFor("FULLY_WITHHELD")} disputed`}
        />
        <StatCard
          label="Total tracked"
          value={formatRWF(byStatus.reduce((s, g) => s + (g._sum.amount ?? 0), 0))}
        />
      </div>

      <Card title={`Deposits (${deposits.length})`}>
        {deposits.length === 0 ? (
          <EmptyRow>No deposits recorded yet.</EmptyRow>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr className="border-b border-sand">
                  <Th>Booking</Th>
                  <Th>Client</Th>
                  <Th>Car</Th>
                  <Th>Status</Th>
                  <Th align="right">Amount</Th>
                  <Th align="right">To client</Th>
                  <Th align="right">To owner</Th>
                  <Th>Held since</Th>
                  <Th align="right">Movements</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {deposits.map((d) => (
                  <tr key={d.id}>
                    <Td>
                      <Link
                        href={`/admin/bookings/${d.booking.id}`}
                        className="font-medium hover:text-brand"
                      >
                        {d.booking.reference}
                      </Link>
                    </Td>
                    <Td muted>{d.booking.client.name ?? "—"}</Td>
                    <Td muted>
                      {d.booking.car.make} {d.booking.car.model}
                    </Td>
                    <Td>
                      <Badge tone={TONE[d.status]}>
                        {d.status.toLowerCase().replace(/_/g, " ")}
                      </Badge>
                    </Td>
                    <Td align="right">
                      <span className="font-semibold">{formatRWF(d.amount)}</span>
                    </Td>
                    <Td align="right" muted>
                      {d.clientRefundAmount !== null
                        ? formatRWF(d.clientRefundAmount)
                        : "—"}
                    </Td>
                    <Td align="right" muted>
                      {d.ownerAwardAmount ? formatRWF(d.ownerAwardAmount) : "—"}
                    </Td>
                    <Td muted>{d.heldAt.toLocaleDateString("en-RW")}</Td>
                    <Td align="right" muted>
                      {d._count.movements}
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
