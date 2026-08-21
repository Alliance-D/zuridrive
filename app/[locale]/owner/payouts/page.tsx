/**
 * /owner/payouts — request a payout and see past ones
 *
 * The amount is never entered by the owner — it is derived from the Commission
 * ledger by the API. This page only chooses the destination.
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireOwnerProfile, getAvailableBalance } from "@/lib/owner";
import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/dates";
import { getEnumLabeller } from "@/lib/enum-labels";
import { routes } from "@/lib/routes";
import RequestPayoutButton from "@/components/owner/RequestPayoutButton";
import type { PayoutStatus } from "@prisma/client";
import { Banknote, FileText, ExternalLink } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "owner" });
  return { title: `${t("payouts")} — ZuriDrive` };
}

// Colour only. The label comes from enum.payoutStatus at render time.
const STATUS_STYLES: Record<PayoutStatus, string> = {
  PENDING_REQUEST: "bg-warning-tint text-warning-dark",
  APPROVED: "bg-info-bg text-info",
  PAID: "bg-success-bg text-success",
  FAILED: "bg-danger-bg text-danger",
};

export default async function OwnerPayoutsPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "owner" });
  const label = await getEnumLabeller(params.locale);
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
        <h1 className="text-xl font-bold text-ink">{t("payouts")}</h1>
        <p className="text-sm text-ink-soft">{t("payoutsSub")}</p>
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
            {t("noPayoutMethod")}{" "}
            <Link href={routes.ownerProfile} className="font-semibold underline">
              {t("addOneInProfile")}
            </Link>{" "}
            {t("toStartWithdrawing")}
          </p>
        </div>
      )}

      {/* History */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-ink">
          {t("payoutHistory")}
        </h2>

        {payouts.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl bg-bone px-4 py-6">
            <Banknote className="h-5 w-5 shrink-0 text-ink-faint" />
            <p className="text-sm text-ink-soft">{t("noPayoutsYet")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-sand">
            {payouts.map((p) => (
              <li key={p.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-ink">
                        {formatMoney(p.netAmount)}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[p.status]}`}
                      >
                        {label("payoutStatus", p.status)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {p.method === "MTN_MOMO"
                        ? `MoMo · ${p.momoNumber ?? ""}`
                        : `${p.bankName ?? t("bank")} · ${p.bankAccountNumber ?? ""}`}
                    </p>
                    <p className="text-[11px] text-ink-faint">
                      {t("requestedOn", {
                        date: formatDate(p.requestedAt, params.locale),
                      })}{" "}
                      · {t("payoutTripCount", { count: p._count.items })}
                      {p.paidAt &&
                        ` · ${t("paidOn", { date: formatDate(p.paidAt, params.locale) })}`}
                    </p>

                    {p.status === "FAILED" && p.failureReason && (
                      <p className="mt-1.5 rounded-lg bg-danger-bg px-2.5 py-1.5 text-[11px] text-danger">
                        {p.failureReason}
                      </p>
                    )}

                    {p.requiresSuperAdminApproval &&
                      p.status === "PENDING_REQUEST" && (
                        <p className="mt-1.5 text-[11px] text-warning-dark">
                          {t("largePayout")}
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
                      {t("proof")}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
