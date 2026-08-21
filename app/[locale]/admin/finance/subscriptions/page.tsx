/**
 * /admin/finance/subscriptions — subscription revenue
 *
 * MRR is computed from ACTIVE subscriptions only. TRIAL and LAPSED are shown
 * separately because counting them as revenue would overstate the figure.
 */

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
import SubscriptionActions from "@/components/admin/SubscriptionActions";
import type { SubscriptionStatus } from "@prisma/client";
import { Download, Paperclip, Smartphone } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "finance" });
  return { title: `${t("navSubscriptions")} — ZuriDrive Admin` };
}

const TONE: Record<SubscriptionStatus, "success" | "warn" | "neutral" | "info"> = {
  ACTIVE: "success",
  TRIAL: "info",
  LAPSED: "warn",
  CANCELLED: "neutral",
  PENDING_PAYMENT: "warn",
};

export default async function AdminSubscriptionsPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "finance" });
  const label = await getEnumLabeller(params.locale);
  const session = await requireAdminModule("FINANCE_MANAGER");
  const canOverride = session.user.role === "SUPER_ADMIN";

  const [subs, plans] = await Promise.all([
    prisma.ownerSubscription.findMany({
      include: {
        plan: true,
        owner: {
          select: {
            user: { select: { name: true, phone: true } },
            _count: { select: { cars: true } },
          },
        },
      },
      orderBy: [{ status: "asc" }, { expiresAt: "asc" }],
      take: 100,
    }),
    prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: "asc" },
    }),
  ]);

  // Payments waiting on a human — the only part of this page with actions.
  const pending = subs.filter((s) => s.status === "PENDING_PAYMENT");
  const active = subs.filter((s) => s.status === "ACTIVE");
  const mrr = active.reduce((sum, s) => sum + s.plan.priceMonthly, 0);
  const lapsed = subs.filter((s) => s.status === "LAPSED");

  // Renewals due in the next 7 days.
  const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const renewingSoon = active.filter((s) => s.expiresAt <= soon).length;

  const perPlan = plans.map((p) => ({
    plan: p,
    count: active.filter((s) => s.planId === p.id).length,
  }));

  return (
    <div>
      <PageHeader
        title={t("navSubscriptions")}
        subtitle={t("subscriptionsSub")}
        action={
          <a
            href="/api/admin/finance/export?type=subscriptions"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-sand-dark bg-white px-3 py-2 text-sm font-semibold text-ink-muted hover:border-brand hover:text-brand"
          >
            <Download className="h-4 w-4" />
            {t("csv")}
          </a>
        }
      />

      <FinanceNav
        active="/admin/finance/subscriptions"
        locale={params.locale}
        counts={{ "/admin/finance/subscriptions": pending.length }}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t("mrr")}
          value={formatMoney(mrr)}
          hint={t("activeOnly")}
          tone="dark"
        />
        <StatCard
          label={t("activeCount")}
          value={active.length}
          hint={t("renewingSoon", { count: renewingSoon })}
        />
        <StatCard
          label={t("awaitingConfirmation")}
          value={pending.length}
          tone={pending.length > 0 ? "warn" : "default"}
        />
        <StatCard
          label={t("lapsed")}
          value={lapsed.length}
          tone={lapsed.length > 0 ? "danger" : "default"}
        />
      </div>

      {/* Payments waiting on Finance. Confirming here is what starts a plan —
          and what puts an owner's cars back after a lapse. */}
      {pending.length > 0 && (
        <div className="mb-4">
          <Card title={t("awaitingConfirmationCount", { count: pending.length })}>
            <ul className="divide-y divide-sand">
              {pending.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {s.owner.user.name ?? s.owner.user.phone}
                      <span className="ml-1.5 text-xs font-normal text-ink-soft">
                        {t("wantsPlan", { plan: s.plan.name })}
                      </span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
                      <span className="font-semibold text-brand">
                        {formatMoney(s.pricePaid ?? s.plan.priceMonthly)}
                      </span>
                      <span>
                        {t("requestedOn", {
                          date: formatDate(s.createdAt, params.locale),
                        })}
                      </span>
                      {s.paymentMethod === "MTN_MOMO" ? (
                        <span className="flex items-center gap-1">
                          <Smartphone className="h-3 w-3" />
                          {t("momo")} {s.momoNumber ?? ""}
                        </span>
                      ) : s.paymentProofUrl ? (
                        <a
                          href={s.paymentProofUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 font-semibold text-brand hover:underline"
                        >
                          <Paperclip className="h-3 w-3" />
                          {t("viewProof")}
                        </a>
                      ) : (
                        <span className="text-warning-strong">{t("noProof")}</span>
                      )}
                    </p>
                  </div>

                  <SubscriptionActions
                    subscriptionId={s.id}
                    planName={s.plan.name}
                    canOverride={canOverride}
                  />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <div className="mb-4">
        <Card title={t("planMix")}>
          <div className="grid gap-3 sm:grid-cols-3">
            {perPlan.map(({ plan, count }) => (
              <div key={plan.id} className="rounded-xl bg-bone p-3">
                <p className="text-sm font-semibold text-ink">{plan.name}</p>
                <p className="text-xs text-ink-soft">
                  {formatMoney(plan.priceMonthly)}/month
                </p>
                <p className="mt-1.5 text-lg font-bold text-brand">
                  {count}
                  <span className="ml-1 text-xs font-normal text-ink-faint">
                    {count === 1 ? "owner" : "owners"}
                  </span>
                </p>
                <p className="text-[11px] text-ink-faint">
                  {formatMoney(plan.priceMonthly * count)}/month
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title={t("subscriptionsCount", { count: subs.length })}>
        {subs.length === 0 ? (
          <EmptyRow>
            {t("noSubscriptionsYet")}
          </EmptyRow>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr className="border-b border-sand">
                  <Th>{t("colOwner")}</Th>
                  <Th>{t("colPlan")}</Th>
                  <Th>{t("colStatus")}</Th>
                  <Th align="right">{t("colCars")}</Th>
                  <Th align="right">{t("colMonthly")}</Th>
                  <Th>{t("colStarted")}</Th>
                  <Th>{t("colExpires")}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {subs.map((s) => (
                  <tr key={s.id}>
                    <Td>
                      <span className="font-medium">
                        {s.owner.user.name ?? "—"}
                      </span>
                    </Td>
                    <Td muted>
                      {s.plan.name}
                      {s.isManualOverride && (
                        <span className="ml-1 text-[10px] text-warning-dark">
                          {t("override")}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={TONE[s.status]}>
                        {label("subscriptionStatus", s.status)}
                      </Badge>
                    </Td>
                    <Td align="right" muted>
                      {s.owner._count.cars}
                      {s.plan.maxListings ? ` / ${s.plan.maxListings}` : ""}
                    </Td>
                    <Td align="right">
                      <span className="font-semibold">
                        {formatMoney(s.plan.priceMonthly)}
                      </span>
                    </Td>
                    <Td muted>{formatDate(s.startedAt, params.locale)}</Td>
                    <Td muted>{formatDate(s.expiresAt, params.locale)}</Td>
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
