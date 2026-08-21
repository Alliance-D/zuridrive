/**
 * /owner/earnings — earnings breakdown
 *
 * Every figure comes from the Commission ledger (one row per booking, written
 * at booking time and never recalculated), so what an owner sees here is
 * exactly what finance will pay.
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireOwnerProfile, getAvailableBalance } from "@/lib/owner";
import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/dates";
import { routes } from "@/lib/routes";
import { Wallet, TrendingUp, Receipt, Banknote } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "owner" });
  return { title: `${t("earnings")} — ZuriDrive` };
}

export default async function OwnerEarningsPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "owner" });
  const { profile } = await requireOwnerProfile();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [balance, monthAgg, commissions] = await Promise.all([
    getAvailableBalance(profile.id),
    prisma.commission.aggregate({
      _sum: { netOwnerAmount: true, commissionAmount: true },
      where: {
        booking: {
          car: { ownerId: profile.id },
          status: "COMPLETED",
          tripEndedAt: { gte: monthStart },
        },
      },
    }),
    prisma.commission.findMany({
      where: {
        booking: { car: { ownerId: profile.id }, status: "COMPLETED" },
      },
      include: {
        booking: {
          select: {
            id: true,
            reference: true,
            tripEndedAt: true,
            totalDays: true,
            car: { select: { make: true, model: true, year: true } },
            client: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const lifetimeCommission = commissions.reduce(
    (s, c) => s + c.commissionAmount,
    0,
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{t("earnings")}</h1>
          <p className="text-sm text-ink-soft">{t("earningsSub")}</p>
        </div>
        {balance.available > 0 && (
          <Link
            href={routes.ownerPayouts}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            <Banknote className="h-4 w-4" />
            {t("requestPayout")}
          </Link>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl bg-brand p-4 text-white shadow-sm">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
            <Wallet className="h-4 w-4 text-accent" />
          </div>
          <p className="text-2xl font-bold">{formatMoney(balance.available)}</p>
          <p className="mt-0.5 text-xs text-brand-tint">{t("availableNow")}</p>
        </div>

        <Stat
          icon={TrendingUp}
          value={formatMoney(monthAgg._sum.netOwnerAmount ?? 0)}
          label={t("thisMonth")}
        />
        <Stat
          icon={Receipt}
          value={formatMoney(balance.totalEarned)}
          label={t("lifetimeEarnings")}
          hint={t("completedTripCount", { count: commissions.length })}
        />
        <Stat
          icon={Banknote}
          value={formatMoney(balance.totalRequested)}
          label={t("alreadyPaidOut")}
        />
      </div>

      {/* Commission explainer */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">
          {t("howEarningsCalculated")}
        </h2>
        <p className="mt-1 text-xs text-ink-soft">{t("commissionExplain")}</p>
        {lifetimeCommission > 0 && (
          <p className="mt-2 text-xs text-ink-faint">
            {t("commissionToDate", { amount: formatMoney(lifetimeCommission) })}
          </p>
        )}
      </div>

      {/* Ledger */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-ink">
          {t("completedTrips")}
        </h2>

        {commissions.length === 0 ? (
          <p className="rounded-xl bg-bone px-4 py-6 text-sm text-ink-soft">
            {t("noCompletedTrips")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand text-left text-xs text-ink-faint">
                  <th className="pb-2 font-medium">{t("colTrip")}</th>
                  <th className="pb-2 font-medium">{t("colCompleted")}</th>
                  <th className="pb-2 text-right font-medium">
                    {t("colRental")}
                  </th>
                  <th className="pb-2 text-right font-medium">
                    {t("colCommission")}
                  </th>
                  <th className="pb-2 text-right font-medium">
                    {t("colYouEarned")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {commissions.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5">
                      <Link
                        href={routes.ownerBookingDetail(c.booking.id)}
                        className="font-medium text-ink hover:text-brand"
                      >
                        {c.booking.car.year} {c.booking.car.make}{" "}
                        {c.booking.car.model}
                      </Link>
                      <p className="text-[11px] text-ink-faint">
                        {c.booking.reference} · {c.booking.totalDays}d ·{" "}
                        {c.booking.client.name ?? t("client")}
                      </p>
                    </td>
                    <td className="py-2.5 text-xs text-ink-soft">
                      {c.booking.tripEndedAt
                        ? formatDate(c.booking.tripEndedAt, params.locale)
                        : "—"}
                    </td>
                    <td className="py-2.5 text-right text-xs text-ink-soft">
                      {formatMoney(c.baseAmount)}
                    </td>
                    <td className="py-2.5 text-right text-xs text-danger-strong">
                      −{formatMoney(c.commissionAmount)}
                    </td>
                    <td className="py-2.5 text-right font-semibold text-brand">
                      {formatMoney(c.netOwnerAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
  hint,
}: {
  icon: React.ElementType;
  value: string;
  label: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-sand">
        <Icon className="h-4 w-4 text-brand" />
      </div>
      <p className="text-2xl font-bold text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-ink-soft">{label}</p>
      {hint && <p className="mt-1 text-[11px] text-ink-faint">{hint}</p>}
    </div>
  );
}
