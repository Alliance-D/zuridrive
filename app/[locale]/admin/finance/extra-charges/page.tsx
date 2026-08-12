/**
 * /admin/finance/extra-charges — post-trip charges
 *
 * Refuelling, damage and late-return fees raised after a trip. Collecting one
 * takes money from the client's held deposit and is recorded as a
 * DepositMovement, so it shows up in reconciliation like any other movement.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdminModule, hasAdminModule } from "@/lib/auth";
import { formatRWF } from "@/lib/currency";
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

export const metadata = { title: "Extra charges — ZuriDrive Admin" };

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

export default async function AdminExtraChargesPage() {
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
        title="Extra charges"
        subtitle="Post-trip fees raised against a booking."
      />

      <FinanceNav
        active="/admin/finance/extra-charges"
        counts={{ "/admin/finance/extra-charges": pending.length }}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="Outstanding"
          value={formatRWF(sumFor("PENDING"))}
          hint={`${countFor("PENDING")} charge${countFor("PENDING") === 1 ? "" : "s"}`}
          tone={countFor("PENDING") > 0 ? "warn" : "default"}
        />
        <StatCard
          label="Collected"
          value={formatRWF(sumFor("COLLECTED"))}
          tone="dark"
        />
        <StatCard label="Waived" value={formatRWF(sumFor("WAIVED"))} />
      </div>

      {!canCollect && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl bg-bone p-3">
          <Lock className="mt-px h-4 w-4 shrink-0 text-ink-faint" />
          <p className="text-xs text-ink-soft">
            You can raise and waive charges. Collecting one takes money from a
            client&apos;s deposit, which needs Deposit Manager access.
          </p>
        </div>
      )}

      <Card title={`Charges (${charges.length})`}>
        {charges.length === 0 ? (
          <EmptyRow>
            No extra charges raised. These are added from a completed
            booking&apos;s detail page when fuel, damage or a late return needs
            settling.
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
                          {formatRWF(c.amount)}
                        </span>
                        <Badge tone="info">{TYPE_LABEL[c.type] ?? c.type}</Badge>
                        <Badge tone={TONE[c.status]}>
                          {c.status.toLowerCase()}
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
                        {c.booking.client.name ?? "Client"} · raised{" "}
                        {c.createdAt.toLocaleDateString("en-RW")}
                      </p>

                      {c.status === "PENDING" && shortfall > 0 && (
                        <p className="mt-1.5 rounded-lg bg-warning-tint px-2.5 py-1.5 text-[11px] text-warning-dark">
                          {heldDeposit === 0
                            ? "No deposit is held on this booking — this charge can't be collected here."
                            : `Only ${formatRWF(heldDeposit)} is held. Collecting leaves ${formatRWF(shortfall)} to pursue separately.`}
                        </p>
                      )}

                      {c.status === "WAIVED" && c.waivedReason && (
                        <p className="mt-1.5 text-[11px] text-ink-soft">
                          Waived: {c.waivedReason}
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
                                    label: "Collect from deposit",
                                    tone: "primary" as const,
                                  },
                                ]
                              : []),
                            {
                              id: "waive",
                              label: "Waive",
                              needsReason: true,
                              reasonPlaceholder: "Why is this being waived?",
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
