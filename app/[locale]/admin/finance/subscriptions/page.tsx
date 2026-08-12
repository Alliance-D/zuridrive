/**
 * /admin/finance/subscriptions — subscription revenue
 *
 * MRR is computed from ACTIVE subscriptions only. TRIAL and LAPSED are shown
 * separately because counting them as revenue would overstate the figure.
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
  TableWrap,
  Th,
  Td,
} from "@/components/admin/ui";
import SubscriptionActions from "@/components/admin/SubscriptionActions";
import type { SubscriptionStatus } from "@prisma/client";
import { Download, Paperclip, Smartphone } from "lucide-react";

export const metadata = { title: "Subscriptions — ZuriDrive Admin" };

const TONE: Record<SubscriptionStatus, "success" | "warn" | "neutral" | "info"> = {
  ACTIVE: "success",
  TRIAL: "info",
  LAPSED: "warn",
  CANCELLED: "neutral",
  PENDING_PAYMENT: "warn",
};

export default async function AdminSubscriptionsPage() {
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
        title="Subscriptions"
        subtitle="Owner plan revenue, separate from booking commission."
        action={
          <a
            href="/api/admin/finance/export?type=subscriptions"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-sand-dark bg-white px-3 py-2 text-sm font-semibold text-ink-muted hover:border-brand hover:text-brand"
          >
            <Download className="h-4 w-4" />
            CSV
          </a>
        }
      />

      <FinanceNav
        active="/admin/finance/subscriptions"
        counts={{ "/admin/finance/subscriptions": pending.length }}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="MRR"
          value={formatRWF(mrr)}
          hint="Active subscriptions only"
          tone="dark"
        />
        <StatCard
          label="Active"
          value={active.length}
          hint={`${renewingSoon} renewing within 7 days`}
        />
        <StatCard
          label="Awaiting confirmation"
          value={pending.length}
          tone={pending.length > 0 ? "warn" : "default"}
        />
        <StatCard
          label="Lapsed"
          value={lapsed.length}
          tone={lapsed.length > 0 ? "danger" : "default"}
        />
      </div>

      {/* Payments waiting on Finance. Confirming here is what starts a plan —
          and what puts an owner's cars back after a lapse. */}
      {pending.length > 0 && (
        <div className="mb-4">
          <Card title={`Awaiting confirmation (${pending.length})`}>
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
                        wants {s.plan.name}
                      </span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
                      <span className="font-semibold text-brand">
                        {formatRWF(s.pricePaid ?? s.plan.priceMonthly)}
                      </span>
                      <span>
                        requested {s.createdAt.toLocaleDateString("en-RW")}
                      </span>
                      {s.paymentMethod === "MTN_MOMO" ? (
                        <span className="flex items-center gap-1">
                          <Smartphone className="h-3 w-3" />
                          MoMo {s.momoNumber ?? ""}
                        </span>
                      ) : s.paymentProofUrl ? (
                        <a
                          href={s.paymentProofUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 font-semibold text-brand hover:underline"
                        >
                          <Paperclip className="h-3 w-3" />
                          View proof
                        </a>
                      ) : (
                        <span className="text-warning-strong">no proof attached</span>
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
        <Card title="Plan mix">
          <div className="grid gap-3 sm:grid-cols-3">
            {perPlan.map(({ plan, count }) => (
              <div key={plan.id} className="rounded-xl bg-bone p-3">
                <p className="text-sm font-semibold text-ink">{plan.name}</p>
                <p className="text-xs text-ink-soft">
                  {formatRWF(plan.priceMonthly)}/month
                </p>
                <p className="mt-1.5 text-lg font-bold text-brand">
                  {count}
                  <span className="ml-1 text-xs font-normal text-ink-faint">
                    {count === 1 ? "owner" : "owners"}
                  </span>
                </p>
                <p className="text-[11px] text-ink-faint">
                  {formatRWF(plan.priceMonthly * count)}/month
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title={`Subscriptions (${subs.length})`}>
        {subs.length === 0 ? (
          <EmptyRow>
            No owner subscriptions yet. Owners can list cars without one during
            early access.
          </EmptyRow>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr className="border-b border-sand">
                  <Th>Owner</Th>
                  <Th>Plan</Th>
                  <Th>Status</Th>
                  <Th align="right">Cars</Th>
                  <Th align="right">Monthly</Th>
                  <Th>Started</Th>
                  <Th>Expires</Th>
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
                          (override)
                        </span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={TONE[s.status]}>{s.status.toLowerCase()}</Badge>
                    </Td>
                    <Td align="right" muted>
                      {s.owner._count.cars}
                      {s.plan.maxListings ? ` / ${s.plan.maxListings}` : ""}
                    </Td>
                    <Td align="right">
                      <span className="font-semibold">
                        {formatRWF(s.plan.priceMonthly)}
                      </span>
                    </Td>
                    <Td muted>{s.startedAt.toLocaleDateString("en-RW")}</Td>
                    <Td muted>{s.expiresAt.toLocaleDateString("en-RW")}</Td>
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
