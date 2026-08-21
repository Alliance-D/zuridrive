/**
 * /admin/finance/payouts — payout queue
 *
 * This is the screen that closes the loop opened in step 10: owners request,
 * finance approves, marks paid, and the owner is notified.
 */

import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireAdminModule } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { getEnumLabeller } from "@/lib/enum-labels";
import { formatMoney } from "@/lib/currency";
import { FinanceNav } from "../nav";
import {
  PageHeader,
  StatCard,
  Card,
  Badge,
  EmptyRow,
} from "@/components/admin/ui";
import PayoutActions from "@/components/admin/PayoutActions";
import type { PayoutStatus } from "@prisma/client";
import { Download, ShieldAlert } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "finance" });
  return { title: `${t("navPayouts")} — ZuriDrive Admin` };
}

const TONE: Record<PayoutStatus, "warn" | "info" | "success" | "danger"> = {
  PENDING_REQUEST: "warn",
  APPROVED: "info",
  PAID: "success",
  FAILED: "danger",
};

export default async function AdminPayoutsPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "finance" });
  const label = await getEnumLabeller(params.locale);
  const session = await requireAdminModule("FINANCE_MANAGER");
  const viewerIsSuperAdmin = session.user.role === "SUPER_ADMIN";

  const [payouts, totals, pendingSum] = await Promise.all([
    prisma.payout.findMany({
      include: {
        owner: {
          select: {
            momoNumber: true,
            bankName: true,
            bankAccountNumber: true,
            user: { select: { name: true, phone: true } },
          },
        },
        _count: { select: { items: true } },
      },
      orderBy: [{ status: "asc" }, { requestedAt: "asc" }],
      take: 100,
    }),
    prisma.payout.aggregate({
      _sum: { netAmount: true },
      where: { status: "PAID" },
    }),
    prisma.payout.aggregate({
      _sum: { netAmount: true },
      _count: true,
      where: { status: { in: ["PENDING_REQUEST", "APPROVED"] } },
    }),
  ]);

  const queue = payouts.filter(
    (p) => p.status === "PENDING_REQUEST" || p.status === "APPROVED",
  );
  const history = payouts.filter(
    (p) => p.status === "PAID" || p.status === "FAILED",
  );

  return (
    <div>
      <PageHeader
        title={t("navPayouts")}
        subtitle={t("payoutsSub")}
        action={
          <a
            href="/api/admin/finance/export?type=payouts"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-sand-dark bg-white px-3 py-2 text-sm font-semibold text-ink-muted hover:border-brand hover:text-brand"
          >
            <Download className="h-4 w-4" />
            {t("csv")}
          </a>
        }
      />

      <FinanceNav
        active="/admin/finance/payouts"
        locale={params.locale}
        counts={{ "/admin/finance/payouts": queue.length }}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label={t("awaitingAction")}
          value={formatMoney(pendingSum._sum.netAmount ?? 0)}
          hint={t("requestCount", { count: pendingSum._count })}
          tone={queue.length > 0 ? "warn" : "default"}
        />
        <StatCard
          label={t("paidOutLifetime")}
          value={formatMoney(totals._sum.netAmount ?? 0)}
          tone="dark"
        />
        <StatCard label={t("inHistory")} value={history.length} />
      </div>

      <div className="mb-4">
        <Card title={t("queue")}>
          {queue.length === 0 ? (
            <EmptyRow>{t("noPayoutsWaiting")}</EmptyRow>
          ) : (
            <ul className="divide-y divide-sand">
              {queue.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-ink">
                        {formatMoney(p.netAmount)}
                      </span>
                      <Badge tone={TONE[p.status]}>
                        {label("payoutStatus", p.status)}
                      </Badge>
                      {p.requiresSuperAdminApproval && (
                        <Badge tone="danger">
                          <span className="inline-flex items-center gap-1">
                            <ShieldAlert className="h-2.5 w-2.5" />
                            {t("largePayout")}
                          </span>
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {p.owner.user.name ?? t("ownerFallback")} ·{" "}
                      {p.method === "MTN_MOMO"
                        ? `${t("momo")} ${p.momoNumber ?? p.owner.momoNumber ?? ""}`
                        : `${p.bankName ?? p.owner.bankName ?? t("bank")} ${
                            p.bankAccountNumber ?? p.owner.bankAccountNumber ?? ""
                          }`}
                    </p>
                    <p className="text-[11px] text-ink-faint">
                      {t("tripCount", { count: p._count.items })} ·{" "}
                      {t("grossMinusCommission", {
                        gross: formatMoney(p.grossAmount),
                        commission: formatMoney(p.commissionDeducted),
                      })}{" "}
                      ·{" "}
                      {t("requestedOn", {
                        date: formatDate(p.requestedAt, params.locale),
                      })}
                    </p>
                  </div>

                  <PayoutActions
                    payoutId={p.id}
                    status={p.status}
                    requiresSuperAdmin={p.requiresSuperAdminApproval}
                    viewerIsSuperAdmin={viewerIsSuperAdmin}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title={t("history")}>
        {history.length === 0 ? (
          <EmptyRow>{t("noCompletedPayouts")}</EmptyRow>
        ) : (
          <ul className="divide-y divide-sand">
            {history.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink">
                      {formatMoney(p.netAmount)}
                    </span>
                    <Badge tone={TONE[p.status]}>{label("payoutStatus", p.status)}</Badge>
                  </div>
                  <p className="text-xs text-ink-soft">
                    {p.owner.user.name ?? t("ownerFallback")} ·{" "}
                    {p.paidAt
                      ? t("paidOn", {
                          date: formatDate(p.paidAt, params.locale),
                        })
                      : t("requestedOn", {
                          date: formatDate(p.requestedAt, params.locale),
                        })}
                    {p.referenceNumber &&
                      ` · ${t("refSuffix", { ref: p.referenceNumber })}`}
                  </p>
                  {p.failureReason && (
                    <p className="mt-1 text-[11px] text-danger">
                      {p.failureReason}
                    </p>
                  )}
                </div>
                {p.proofUrl && (
                  <a
                    href={p.proofUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-[11px] font-semibold text-brand hover:underline"
                  >
                    {t("proof")}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
