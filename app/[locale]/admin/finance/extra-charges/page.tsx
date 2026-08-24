/**
 * /admin/finance/extra-charges — post-trip charges
 *
 * Refuelling, damage and late-return fees raised after a trip. Collecting one
 * takes money from the client's held deposit and is recorded as a
 * DepositMovement, so it shows up in reconciliation like any other movement.
 */

import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { getEnumLabeller } from "@/lib/enum-labels";
import { requireAdminModule, hasAdminModule } from "@/lib/auth";
import { formatMoney } from "@/lib/currency";
import { FinanceNav } from "../nav";
import {
  PageHeader,
  StatCard,
  Card,
  Badge,
  EmptyRow,
} from "@/components/admin/ui";
import ModerationActions from "@/components/admin/ModerationActions";
import type { ExtraChargeStatus } from "@prisma/client";
import { Lock } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "finance" });
  return { title: `${t("navExtraCharges")} — ZuriDrive Admin` };
}

const TYPE_LABEL: Record<string, string> = {
  REFUELING_FEE: "Refuelling",
  DAMAGE_FEE: "Damage",
  LATE_RETURN_FEE: "Late return",
  OTHER: "Other",
};

const TONE: Record<ExtraChargeStatus, "warn" | "success" | "neutral"> = {
  PENDING: "warn",
  COLLECTED: "success",
  WAIVED: "neutral",
};

export default async function AdminExtraChargesPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "finance" });
  const label = await getEnumLabeller(params.locale);
  await requireAdminModule("FINANCE_MANAGER");
  const canCollect = await hasAdminModule("DEPOSIT_MANAGER");

  const [charges, totals] = await Promise.all([
    prisma.extraCharge.findMany({
      include: {
        booking: {
          select: {
            id: true,
            reference: true,
            client: { select: { name: true } },
            deposit: { select: { amount: true, status: true } },
            car: { select: { make: true, model: true } },
          },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.extraCharge.groupBy({
      by: ["status"],
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  const sumFor = (s: ExtraChargeStatus) =>
    totals.find((t) => t.status === s)?._sum.amount ?? 0;
  const countFor = (s: ExtraChargeStatus) =>
    totals.find((t) => t.status === s)?._count ?? 0;

  const pending = charges.filter((c) => c.status === "PENDING");

  return (
    <div>
      <PageHeader
        title={t("navExtraCharges")}
        subtitle={t("extraChargesSub")}
      />

      <FinanceNav
        active="/admin/finance/extra-charges"
        locale={params.locale}
        counts={{ "/admin/finance/extra-charges": pending.length }}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label={t("outstanding")}
          value={formatMoney(sumFor("PENDING"))}
          hint={t("chargeCount", { count: countFor("PENDING") })}
          tone={countFor("PENDING") > 0 ? "warn" : "default"}
        />
        <StatCard
          label={t("collected")}
          value={formatMoney(sumFor("COLLECTED"))}
          tone="dark"
        />
        <StatCard label={t("waived")} value={formatMoney(sumFor("WAIVED"))} />
      </div>

      {!canCollect && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl bg-bone p-3">
          <Lock className="mt-px h-4 w-4 shrink-0 text-ink-faint" />
          <p className="text-xs text-ink-soft">
            {t("canRaiseNotCollect")}
          </p>
        </div>
      )}

      <Card title={t("chargesCount", { count: charges.length })}>
        {charges.length === 0 ? (
          <EmptyRow>
            {t("noChargesYet")}
          </EmptyRow>
        ) : (
          <ul className="divide-y divide-sand">
            {charges.map((c) => {
              const heldDeposit =
                c.booking.deposit && c.booking.deposit.status === "HELD"
                  ? c.booking.deposit.amount
                  : 0;
              const shortfall = Math.max(0, c.amount - heldDeposit);

              return (
                <li key={c.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-ink">
                          {formatMoney(c.amount)}
                        </span>
                        <Badge tone="info">{label("chargeType", c.type)}</Badge>
                        <Badge tone={TONE[c.status]}>
                          {label("chargeStatus", c.status)}
                        </Badge>
                      </div>

                      <p className="mt-1 text-xs text-ink-muted">
                        {c.description}
                      </p>

                      <p className="mt-0.5 text-[11px] text-ink-faint">
                        <Link
                          href={`/admin/bookings/${c.booking.id}`}
                          className="hover:text-brand"
                        >
                          {c.booking.reference}
                        </Link>{" "}
                        · {c.booking.car.make} {c.booking.car.model} ·{" "}
                        {c.booking.client.name ?? t("clientFallback")} ·{" "}
                        {t("raisedOn", {
                          date: formatDate(c.createdAt, params.locale),
                        })}
                      </p>

                      {c.status === "PENDING" && shortfall > 0 && (
                        <p className="mt-1.5 rounded-lg bg-warning-tint px-2.5 py-1.5 text-[11px] text-warning-dark">
                          {heldDeposit === 0
                            ? t("noDepositHeld")
                            : t("partialDeposit", {
                                held: formatMoney(heldDeposit),
                                shortfall: formatMoney(shortfall),
                              })}
                        </p>
                      )}

                      {c.status === "WAIVED" && c.waivedReason && (
                        <p className="mt-1.5 text-[11px] text-ink-soft">
                          {t("waivedReason", { reason: c.waivedReason })}
                        </p>
                      )}
                    </div>

                    {c.status === "PENDING" && (
                      <div className="w-full lg:w-auto">
                        <ModerationActions
                          endpoint="/api/admin/extra-charges"
                          method="PATCH"
                          extraBody={{ id: c.id }}
                          actions={[
                            ...(canCollect && heldDeposit > 0
                              ? [
                                  {
                                    id: "collect",
                                    label: t("collectFromDeposit"),
                                    tone: "primary" as const,
                                  },
                                ]
                              : []),
                            {
                              id: "waive",
                              label: t("waive"),
                              needsReason: true,
                              reasonPlaceholder: t("waiveReason"),
                            },
                          ]}
                        />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
