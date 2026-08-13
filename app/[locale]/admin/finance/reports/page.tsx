/**
 * /admin/finance/reports — reconciliation
 *
 * Shows a live check plus the history of every past run. The live figures are
 * computed on page load; pressing "Run check" persists a ReconciliationLog row
 * and alerts Super Admins if anything is off.
 */

import { prisma } from "@/lib/db";
import { requireAdminModule } from "@/lib/auth";
import { formatRWF } from "@/lib/currency";
import { runReconciliation } from "@/lib/finance/reconciliation";
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
import { getTranslations } from "next-intl/server";
import { formatDateTime } from "@/lib/dates";
import RunReconciliation from "@/components/admin/RunReconciliation";
import { CheckCircle2, AlertTriangle, Download } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "finance" });
  return { title: `${t("navReconciliation")} — ZuriDrive Admin` };
}

export default async function AdminReportsPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "finance" });
  await requireAdminModule("FINANCE_MANAGER");

  const [live, history] = await Promise.all([
    runReconciliation(),
    prisma.reconciliationLog.findMany({
      orderBy: { runAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title={t("navReconciliation")}
        subtitle={t("reconciliationSub")}
        action={
          <div className="flex gap-2">
            <a
              href="/api/admin/finance/export?type=reconciliation"
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-sand-dark bg-white px-3 py-2 text-sm font-semibold text-ink-muted hover:border-brand hover:text-brand"
            >
              <Download className="h-4 w-4" />
              {t("csv")}
            </a>
            <RunReconciliation />
          </div>
        }
      />

      <FinanceNav active="/admin/finance/reports" locale={params.locale} />

      {/* Live status */}
      <div
        className={`mb-4 flex items-start gap-3 rounded-2xl p-4 ${
          live.hasMismatch ? "bg-danger-bg" : "bg-success-bg"
        }`}
      >
        {live.hasMismatch ? (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
        )}
        <div>
          <p
            className={`text-sm font-bold ${
              live.hasMismatch ? "text-danger" : "text-success"
            }`}
          >
            {live.hasMismatch
              ? t("booksOffBy", {
                  amount: formatRWF(live.discrepancyAmount),
                })
              : t("booksBalance")}
          </p>
          {live.notes.length > 0 ? (
            <ul className="mt-1 space-y-0.5">
              {live.notes.map((n, i) => (
                <li key={i} className="text-xs text-danger">
                  {n}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-0.5 text-xs text-success">
              {t("booksBalanceNote")}
            </p>
          )}
        </div>
      </div>

      {/* Money in */}
      <div className="mb-4">
        <Card title={t("moneyCollected")}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard
              label={t("rentalIncome")}
              value={formatRWF(live.rentalCollected)}
            />
            <StatCard
              label={t("depositsTaken")}
              value={formatRWF(live.depositsCollected)}
              hint={t("clientMoneyInTrust")}
            />
            <StatCard
              label={t("totalCollected")}
              value={formatRWF(live.totalCollected)}
              tone="dark"
            />
          </div>
        </Card>
      </div>

      {/* Money out / owed */}
      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <Card title={t("platformVsOwners")}>
          <dl className="space-y-2 text-sm">
            <Row
              label={t("commissionEarned")}
              value={formatRWF(live.totalCommission)}
            />
            <Row
              label={t("ownerEarnings")}
              value={formatRWF(live.ownerEarningsRealised)}
            />
            <Row
              label={t("paidOutToOwners")}
              value={formatRWF(live.totalPaidOut)}
            />
            <div className="border-t border-sand pt-2">
              <Row
                label={t("stillOwed")}
                value={formatRWF(live.outstandingOwnerBalance)}
                strong
              />
            </div>
          </dl>
        </Card>

        <Card title={t("depositPosition")}>
          <dl className="space-y-2 text-sm">
            <Row
              label={t("currentlyHeld")}
              value={formatRWF(live.totalDepositsHeld)}
            />
            <Row
              label={t("returnedToClients")}
              value={formatRWF(live.totalDepositsReleased)}
            />
            <Row
              label={t("withheldAwarded")}
              value={formatRWF(live.totalDepositsWithheld)}
            />
            <div className="border-t border-sand pt-2">
              <Row
                label={t("accountedFor")}
                value={formatRWF(
                  live.totalDepositsHeld +
                    live.totalDepositsReleased +
                    live.totalDepositsWithheld,
                )}
                strong
              />
            </div>
            {live.pendingDeposits > 0 && (
              <p className="pt-1 text-[11px] text-ink-faint">
                {t("pendingDepositsNote", {
                  amount: formatRWF(live.pendingDeposits),
                })}
              </p>
            )}
          </dl>
        </Card>
      </div>

      {/* History */}
      <Card title={t("checkHistory")}>
        {history.length === 0 ? (
          <EmptyRow>
            {t("noChecksRecorded")}
          </EmptyRow>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr className="border-b border-sand">
                  <Th>{t("colRunAt")}</Th>
                  <Th>{t("colResult")}</Th>
                  <Th align="right">{t("colCollected")}</Th>
                  <Th align="right">{t("colCommission")}</Th>
                  <Th align="right">{t("colPaidOut")}</Th>
                  <Th align="right">{t("colDepositsHeld")}</Th>
                  <Th align="right">{t("colDiscrepancy")}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {history.map((h) => (
                  <tr key={h.id}>
                    <Td muted>
                      {formatDateTime(h.runAt, params.locale)}
                    </Td>
                    <Td>
                      <Badge tone={h.hasMismatch ? "danger" : "success"}>
                        {h.hasMismatch ? t("mismatch") : t("balanced")}
                      </Badge>
                    </Td>
                    <Td align="right" muted>
                      {formatRWF(h.totalCollected)}
                    </Td>
                    <Td align="right" muted>
                      {formatRWF(h.totalCommission)}
                    </Td>
                    <Td align="right" muted>
                      {formatRWF(h.totalPaidOut)}
                    </Td>
                    <Td align="right" muted>
                      {formatRWF(h.totalDepositsHeld)}
                    </Td>
                    <Td align="right">
                      <span
                        className={
                          h.hasMismatch
                            ? "font-semibold text-danger-strong"
                            : "text-ink-soft"
                        }
                      >
                        {formatRWF(h.discrepancyAmount)}
                      </span>
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

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={`text-xs ${strong ? "font-semibold text-ink" : "text-ink-soft"}`}>
        {label}
      </dt>
      <dd
        className={`text-sm ${strong ? "font-bold text-brand" : "font-medium text-ink"}`}
      >
        {value}
      </dd>
    </div>
  );
}
