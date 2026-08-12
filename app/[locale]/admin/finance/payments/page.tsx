/**
 * /admin/finance/payments — payments ledger
 *
 * Bank transfers awaiting confirmation are pulled to the top: they are the
 * only payments a human has to action, and a client is waiting on each one.
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
import PaymentActions from "@/components/admin/PaymentActions";
import type { PaymentStatus } from "@prisma/client";
import { Download } from "lucide-react";

export const metadata = { title: "Payments — ZuriDrive Admin" };

const STATUS_TONE: Record<PaymentStatus, "success" | "warn" | "danger" | "neutral"> = {
  CONFIRMED: "success",
  PENDING: "warn",
  FAILED: "danger",
  REFUNDED: "neutral",
};

export default async function AdminPaymentsPage() {
  await requireAdminModule("FINANCE_MANAGER");

  const [awaiting, recent, totals] = await Promise.all([
    // Bank transfers with proof uploaded, still unconfirmed
    prisma.payment.findMany({
      where: {
        method: "BANK_TRANSFER",
        status: "PENDING",
        isVoided: false,
        proofUrl: { not: null },
      },
      include: {
        booking: {
          select: {
            id: true,
            reference: true,
            client: { select: { name: true, phone: true } },
            car: { select: { make: true, model: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.payment.findMany({
      include: {
        booking: {
          select: {
            id: true,
            reference: true,
            client: { select: { name: true } },
            car: { select: { make: true, model: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.payment.aggregate({
      _sum: { rentalAmount: true, depositAmount: true, totalAmount: true },
      where: { status: "CONFIRMED", isVoided: false },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Everything clients have paid, and what still needs confirming."
        action={
          <a
            href="/api/admin/finance/export?type=payments"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-sand-dark bg-white px-3 py-2 text-sm font-semibold text-ink-muted hover:border-brand hover:text-brand"
          >
            <Download className="h-4 w-4" />
            CSV
          </a>
        }
      />

      <FinanceNav
        active="/admin/finance/payments"
        counts={{ "/admin/finance/payments": awaiting.length }}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Collected (rental)"
          value={formatRWF(totals._sum.rentalAmount ?? 0)}
          tone="dark"
        />
        <StatCard
          label="Collected (deposits)"
          value={formatRWF(totals._sum.depositAmount ?? 0)}
          hint="Held on behalf of clients"
        />
        <StatCard
          label="Total confirmed"
          value={formatRWF(totals._sum.totalAmount ?? 0)}
        />
        <StatCard
          label="Awaiting confirmation"
          value={awaiting.length}
          tone={awaiting.length > 0 ? "warn" : "default"}
        />
      </div>

      {/* Action queue */}
      <div className="mb-4">
        <Card title="Bank transfers to confirm">
          {awaiting.length === 0 ? (
            <EmptyRow>
              Nothing waiting. Bank transfers appear here once a client uploads
              proof of payment.
            </EmptyRow>
          ) : (
            <ul className="divide-y divide-sand">
              {awaiting.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/admin/bookings/${p.booking.id}`}
                      className="text-sm font-semibold text-ink hover:text-brand"
                    >
                      {formatRWF(p.totalAmount)} · {p.booking.reference}
                    </Link>
                    <p className="text-xs text-ink-soft">
                      {p.booking.client.name ?? "Client"} ·{" "}
                      {p.booking.car.make} {p.booking.car.model} · uploaded{" "}
                      {p.createdAt.toLocaleDateString("en-RW")}
                    </p>
                    <p className="text-[11px] text-ink-faint">
                      Rental {formatRWF(p.rentalAmount)} + deposit{" "}
                      {formatRWF(p.depositAmount)}
                    </p>
                  </div>
                  <PaymentActions paymentId={p.id} proofUrl={p.proofUrl} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Full ledger */}
      <Card title={`All payments (${recent.length})`}>
        {recent.length === 0 ? (
          <EmptyRow>No payments recorded yet.</EmptyRow>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr className="border-b border-sand">
                  <Th>Booking</Th>
                  <Th>Client</Th>
                  <Th>Method</Th>
                  <Th>Status</Th>
                  <Th align="right">Rental</Th>
                  <Th align="right">Deposit</Th>
                  <Th align="right">Total</Th>
                  <Th>Date</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {recent.map((p) => (
                  <tr key={p.id} className={p.isVoided ? "opacity-50" : ""}>
                    <Td>
                      <Link
                        href={`/admin/bookings/${p.booking.id}`}
                        className="font-medium hover:text-brand"
                      >
                        {p.booking.reference}
                      </Link>
                    </Td>
                    <Td muted>{p.booking.client.name ?? "—"}</Td>
                    <Td muted>
                      {p.method === "MTN_MOMO" ? "MoMo" : "Bank"}
                    </Td>
                    <Td>
                      <Badge tone={p.isVoided ? "neutral" : STATUS_TONE[p.status]}>
                        {p.isVoided ? "voided" : p.status.toLowerCase()}
                      </Badge>
                    </Td>
                    <Td align="right" muted>
                      {formatRWF(p.rentalAmount)}
                    </Td>
                    <Td align="right" muted>
                      {p.depositAmount ? formatRWF(p.depositAmount) : "—"}
                    </Td>
                    <Td align="right">
                      <span className="font-semibold">
                        {formatRWF(p.totalAmount)}
                      </span>
                    </Td>
                    <Td muted>{p.createdAt.toLocaleDateString("en-RW")}</Td>
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
