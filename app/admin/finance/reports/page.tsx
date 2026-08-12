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
import RunReconciliation from "@/components/admin/RunReconciliation";
import { CheckCircle2, AlertTriangle, Download } from "lucide-react";

export const metadata = { title: "Reconciliation — ZuriDrive Admin" };

export default async function AdminReportsPage() {
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
        title="Reconciliation"
        subtitle="Checks that every franc collected can be explained by the ledgers."
        action={
          <div className="flex gap-2">
            <a
              href="/api/admin/finance/export?type=reconciliation"
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-sand-dark bg-white px-3 py-2 text-sm font-semibold text-ink-muted hover:border-brand hover:text-brand"
            >
              <Download className="h-4 w-4" />
              CSV
            </a>
            <RunReconciliation />
          </div>
        }
      />

      <FinanceNav active="/admin/finance/reports" />

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
              ? `Books are off by ${formatRWF(live.discrepancyAmount)}`
              : "Books balance"}
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
              Commission and owner earnings reconstruct the commissionable base,
              and every deposit is accounted for.
            </p>
          )}
        </div>
      </div>

      {/* Money in */}
      <div className="mb-4">
        <Card title="Money collected">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard
              label="Rental income"
              value={formatRWF(live.rentalCollected)}
            />
            <StatCard
              label="Deposits taken"
              value={formatRWF(live.depositsCollected)}
              hint="Client money, held in trust"
            />
            <StatCard
              label="Total collected"
              value={formatRWF(live.totalCollected)}
              tone="dark"
            />
          </div>
        </Card>
      </div>

      {/* Money out / owed */}
      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <Card title="Platform vs owners">
          <dl className="space-y-2 text-sm">
            <Row
              label="Commission earned (completed trips)"
              value={formatRWF(live.totalCommission)}
            />
            <Row
              label="Owner earnings (completed trips)"
              value={formatRWF(live.ownerEarningsRealised)}
            />
            <Row label="Paid out to owners" value={formatRWF(live.totalPaidOut)} />
            <div className="border-t border-sand pt-2">
              <Row
                label="Still owed to owners"
                value={formatRWF(live.outstandingOwnerBalance)}
                strong
              />
            </div>
          </dl>
        </Card>

        <Card title="Deposit position">
          <dl className="space-y-2 text-sm">
            <Row label="Currently held" value={formatRWF(live.totalDepositsHeld)} />
            <Row
              label="Returned to clients"
              value={formatRWF(live.totalDepositsReleased)}
            />
            <Row
              label="Withheld (awarded to owners)"
              value={formatRWF(live.totalDepositsWithheld)}
            />
            <div className="border-t border-sand pt-2">
              <Row
                label="Accounted for"
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
                A further {formatRWF(live.pendingDeposits)} is pending on unpaid
                bookings. No money has been collected for these, so they are
                excluded from the figures above.
              </p>
            )}
          </dl>
        </Card>
      </div>

      {/* History */}
      <Card title="Check history">
        {history.length === 0 ? (
          <EmptyRow>
            No checks recorded yet. Press &ldquo;Run check&rdquo; to save one.
          </EmptyRow>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr className="border-b border-sand">
                  <Th>Run at</Th>
                  <Th>Result</Th>
                  <Th align="right">Collected</Th>
                  <Th align="right">Commission</Th>
                  <Th align="right">Paid out</Th>
                  <Th align="right">Deposits held</Th>
                  <Th align="right">Discrepancy</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {history.map((h) => (
                  <tr key={h.id}>
                    <Td muted>
                      {h.runAt.toLocaleString("en-RW", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </Td>
                    <Td>
                      <Badge tone={h.hasMismatch ? "danger" : "success"}>
                        {h.hasMismatch ? "mismatch" : "balanced"}
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
