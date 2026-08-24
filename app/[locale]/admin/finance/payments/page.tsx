/**
 * /admin/finance/payments — payments ledger
 *
 * Bank transfers awaiting confirmation are pulled to the top: they are the
 * only payments a human has to action, and a client is waiting on each one.
 */

import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { getEnumLabeller } from "@/lib/enum-labels";
import { requireAdminModule } from "@/lib/auth";
import { formatMoney } from "@/lib/currency";
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

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "finance" });
  return { title: `${t("navPayments")} — ZuriDrive Admin` };
}

const STATUS_TONE: Record<PaymentStatus, "success" | "warn" | "danger" | "neutral"> = {
  CONFIRMED: "success",
  PENDING: "warn",
  FAILED: "danger",
  REFUNDED: "neutral",
};

export default async function AdminPaymentsPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "finance" });
  const label = await getEnumLabeller(params.locale);
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
        title={t("navPayments")}
        subtitle={t("paymentsSub")}
        action={
          <a
            href="/api/admin/finance/export?type=payments"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-sand-dark bg-white px-3 py-2 text-sm font-semibold text-ink-muted hover:border-brand hover:text-brand"
          >
            <Download className="h-4 w-4" />
            {t("csv")}
          </a>
        }
      />

      <FinanceNav
        active="/admin/finance/payments"
        locale={params.locale}
        counts={{ "/admin/finance/payments": awaiting.length }}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t("collectedRental")}
          value={formatMoney(totals._sum.rentalAmount ?? 0)}
          tone="dark"
        />
        <StatCard
          label={t("collectedDeposits")}
          value={formatMoney(totals._sum.depositAmount ?? 0)}
          hint={t("heldOnBehalf")}
        />
        <StatCard
          label={t("totalConfirmed")}
          value={formatMoney(totals._sum.totalAmount ?? 0)}
        />
        <StatCard
          label={t("awaitingConfirmation")}
          value={awaiting.length}
          tone={awaiting.length > 0 ? "warn" : "default"}
        />
      </div>

      {/* Action queue */}
      <div className="mb-4">
        <Card title={t("bankTransfersToConfirm")}>
          {awaiting.length === 0 ? (
            <EmptyRow>
              {t("nothingWaitingProof")}
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
                      {formatMoney(p.totalAmount)} · {p.booking.reference}
                    </Link>
                    <p className="text-xs text-ink-soft">
                      {p.booking.client.name ?? t("clientFallback")} ·{" "}
                      {p.booking.car.make} {p.booking.car.model} ·{" "}
                      {t("uploadedOn", {
                        date: formatDate(p.createdAt, params.locale),
                      })}
                    </p>
                    <p className="text-[11px] text-ink-faint">
                      {t("rentalPlusDeposit", {
                        rental: formatMoney(p.rentalAmount),
                        deposit: formatMoney(p.depositAmount),
                      })}
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
      <Card title={t("allPayments", { count: recent.length })}>
        {recent.length === 0 ? (
          <EmptyRow>{t("noPaymentsYet")}</EmptyRow>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr className="border-b border-sand">
                  <Th>{t("colBooking")}</Th>
                  <Th>{t("colClient")}</Th>
                  <Th>{t("colMethod")}</Th>
                  <Th>{t("colStatus")}</Th>
                  <Th align="right">{t("colRental")}</Th>
                  <Th align="right">{t("colDeposit")}</Th>
                  <Th align="right">{t("colTotal")}</Th>
                  <Th>{t("colDate")}</Th>
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
                      {p.method === "MTN_MOMO" ? t("momo") : t("bank")}
                    </Td>
                    <Td>
                      <Badge tone={p.isVoided ? "neutral" : STATUS_TONE[p.status]}>
                        {p.isVoided
                          ? t("voided")
                          : label("paymentStatus", p.status)}
                      </Badge>
                    </Td>
                    <Td align="right" muted>
                      {formatMoney(p.rentalAmount)}
                    </Td>
                    <Td align="right" muted>
                      {p.depositAmount ? formatMoney(p.depositAmount) : "—"}
                    </Td>
                    <Td align="right">
                      <span className="font-semibold">
                        {formatMoney(p.totalAmount)}
                      </span>
                    </Td>
                    <Td muted>{formatDate(p.createdAt, params.locale)}</Td>
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
