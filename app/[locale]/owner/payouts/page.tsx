/**
 * /owner/payouts — request a payout and see past ones
 *
 * The amount is never entered by the owner — it is derived from the Commission
 * ledger by the API. This page only chooses the destination.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireOwnerProfile, getAvailableBalance } from "@/lib/owner";
import { formatRWF } from "@/lib/currency";
import { routes } from "@/lib/routes";
import RequestPayoutButton from "@/components/owner/RequestPayoutButton";
import type { PayoutStatus } from "@prisma/client";
import { Banknote, FileText, ExternalLink } from "lucide-react";

export const metadata = { title: "Payouts — ZuriDrive" };

const STATUS_STYLES: Record<PayoutStatus, { label: string; className: string }> = {
  PENDING_REQUEST: {
    label: "Awaiting review",
    className: "bg-warning-tint text-warning-dark",
  },
  APPROVED: { label: "Approved", className: "bg-info-bg text-info" },
  PAID: { label: "Paid", className: "bg-success-bg text-success" },
  FAILED: { label: "Failed", className: "bg-danger-bg text-danger" },
};

export default async function OwnerPayoutsPage() {
  const { profile } = await requireOwnerProfile();

  const [balance, payouts] = await Promise.all([
    getAvailableBalance(profile.id),
    prisma.payout.findMany({
      where: { ownerId: profile.id },
      include: { _count: { select: { items: true } } },
      orderBy: { requestedAt: "desc" },
    }),
  ]);

  const hasOpenRequest = payouts.some(
    (p) => p.status === "PENDING_REQUEST" || p.status === "APPROVED",
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink">Payouts</h1>
        <p className="text-sm text-ink-soft">
          Withdraw your earnings to MoMo or your bank account.
        </p>
      </div>

      <RequestPayoutButton
        available={balance.available}
        hasMomo={Boolean(profile.momoNumber)}
        hasBank={Boolean(profile.bankAccountNumber)}
        hasOpenRequest={hasOpenRequest}
      />

      {!profile.momoNumber && !profile.bankAccountNumber && (
        <div className="rounded-2xl bg-warning-bg p-4">
          <p className="text-sm text-warning">
            You haven&apos;t added a payout method yet.{" "}
            <Link href={routes.ownerProfile} className="font-semibold underline">
              Add one in your profile
            </Link>{" "}
            to start withdrawing.
          </p>
        </div>
      )}

      {/* History */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-ink">
          Payout history
        </h2>

        {payouts.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl bg-bone px-4 py-6">
            <Banknote className="h-5 w-5 shrink-0 text-ink-faint" />
            <p className="text-sm text-ink-soft">
              No payouts yet. Once you complete a trip, your earnings become
              available to withdraw.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-sand">
            {payouts.map((p) => {
              const status = STATUS_STYLES[p.status];
              return (
                <li key={p.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-ink">
                          {formatRWF(p.netAmount)}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {p.method === "MTN_MOMO"
                          ? `MoMo · ${p.momoNumber ?? ""}`
                          : `${p.bankName ?? "Bank"} · ${p.bankAccountNumber ?? ""}`}
                      </p>
                      <p className="text-[11px] text-ink-faint">
                        Requested {p.requestedAt.toLocaleDateString("en-RW")} ·{" "}
                        {p._count.items} trip{p._count.items === 1 ? "" : "s"}
                        {p.paidAt &&
                          ` · paid ${p.paidAt.toLocaleDateString("en-RW")}`}
                      </p>

                      {p.status === "FAILED" && p.failureReason && (
                        <p className="mt-1.5 rounded-lg bg-danger-bg px-2.5 py-1.5 text-[11px] text-danger">
                          {p.failureReason}
                        </p>
                      )}

                      {p.requiresSuperAdminApproval &&
                        p.status === "PENDING_REQUEST" && (
                          <p className="mt-1.5 text-[11px] text-warning-dark">
                            Large payout — needs an extra approval step.
                          </p>
                        )}
                    </div>

                    {p.proofUrl && (
                      <a
                        href={p.proofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex shrink-0 items-center gap-1 rounded-lg border border-sand-dark px-2.5 py-1.5 text-xs font-semibold text-ink-muted hover:border-brand hover:text-brand"
                      >
                        <FileText className="h-3 w-3" />
                        Proof
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
