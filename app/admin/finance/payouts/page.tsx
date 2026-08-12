/**
 * /admin/finance/payouts — payout queue
 *
 * This is the screen that closes the loop opened in step 10: owners request,
 * finance approves, marks paid, and the owner is notified.
 */

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
} from "@/components/admin/ui";
import PayoutActions from "@/components/admin/PayoutActions";
import type { PayoutStatus } from "@prisma/client";
import { Download, ShieldAlert } from "lucide-react";

export const metadata = { title: "Payouts — ZuriDrive Admin" };

const TONE: Record<PayoutStatus, "warn" | "info" | "success" | "danger"> = {
  PENDING_REQUEST: "warn",
  APPROVED: "info",
  PAID: "success",
  FAILED: "danger",
};

export default async function AdminPayoutsPage() {
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
        title="Payouts"
        subtitle="Approve owner withdrawals and record transfers."
        action={
          <a
            href="/api/admin/finance/export?type=payouts"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-sand-dark bg-white px-3 py-2 text-sm font-semibold text-ink-muted hover:border-brand hover:text-brand"
          >
            <Download className="h-4 w-4" />
            CSV
          </a>
        }
      />

      <FinanceNav
        active="/admin/finance/payouts"
        counts={{ "/admin/finance/payouts": queue.length }}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="Awaiting action"
          value={formatRWF(pendingSum._sum.netAmount ?? 0)}
          hint={`${pendingSum._count} request${pendingSum._count === 1 ? "" : "s"}`}
          tone={queue.length > 0 ? "warn" : "default"}
        />
        <StatCard
          label="Paid out (lifetime)"
          value={formatRWF(totals._sum.netAmount ?? 0)}
          tone="dark"
        />
        <StatCard label="In history" value={history.length} />
      </div>

      <div className="mb-4">
        <Card title="Queue">
          {queue.length === 0 ? (
            <EmptyRow>No payout requests waiting.</EmptyRow>
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
                        {formatRWF(p.netAmount)}
                      </span>
                      <Badge tone={TONE[p.status]}>
                        {p.status.toLowerCase().replace("_", " ")}
                      </Badge>
                      {p.requiresSuperAdminApproval && (
                        <Badge tone="danger">
                          <span className="inline-flex items-center gap-1">
                            <ShieldAlert className="h-2.5 w-2.5" />
                            large payout
                          </span>
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {p.owner.user.name ?? "Owner"} ·{" "}
                      {p.method === "MTN_MOMO"
                        ? `MoMo ${p.momoNumber ?? p.owner.momoNumber ?? ""}`
                        : `${p.bankName ?? p.owner.bankName ?? "Bank"} ${
                            p.bankAccountNumber ?? p.owner.bankAccountNumber ?? ""
                          }`}
                    </p>
                    <p className="text-[11px] text-ink-faint">
                      {p._count.items} trip{p._count.items === 1 ? "" : "s"} ·
                      gross {formatRWF(p.grossAmount)} − commission{" "}
                      {formatRWF(p.commissionDeducted)} · requested{" "}
                      {p.requestedAt.toLocaleDateString("en-RW")}
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

      <Card title="History">
        {history.length === 0 ? (
          <EmptyRow>No completed payouts yet.</EmptyRow>
        ) : (
          <ul className="divide-y divide-sand">
            {history.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink">
                      {formatRWF(p.netAmount)}
                    </span>
                    <Badge tone={TONE[p.status]}>{p.status.toLowerCase()}</Badge>
                  </div>
                  <p className="text-xs text-ink-soft">
                    {p.owner.user.name ?? "Owner"} ·{" "}
                    {p.paidAt
                      ? `paid ${p.paidAt.toLocaleDateString("en-RW")}`
                      : `requested ${p.requestedAt.toLocaleDateString("en-RW")}`}
                    {p.referenceNumber && ` · ref ${p.referenceNumber}`}
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
                    Proof
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
