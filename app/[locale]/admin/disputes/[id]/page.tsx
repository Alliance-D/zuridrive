/**
 * /admin/disputes/[id] — dispute detail
 *
 * Everything needed to decide, on one screen: who raised it and what they
 * said, the trip and money involved, the condition photos side by side, and
 * the resolution form.
 *
 * Photos are the evidence — pre-trip vs post-trip is usually the whole
 * argument, especially for fuel and damage claims.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdminModule, hasAdminModule } from "@/lib/auth";
import { formatRWF } from "@/lib/currency";
import { PageHeader, Card, Badge } from "@/components/admin/ui";
import { PhotoComparisonView } from "@/components/photos/PhotoComparisonView";
import ResolveDisputeForm from "@/components/admin/ResolveDisputeForm";
import { ChevronLeft, Scale, User, Building2, Lock } from "lucide-react";

export const metadata = { title: "Dispute — ZuriDrive Admin" };

const TYPE_LABEL: Record<string, string> = {
  DAMAGE: "Damage claim",
  FUEL: "Fuel dispute",
  LATE_RETURN: "Late return",
  NO_SHOW: "No show",
  OTHER: "Other",
};

const OUTCOME_LABEL: Record<string, string> = {
  RESOLVED_FOR_CLIENT: "Resolved for the client",
  RESOLVED_FOR_OWNER: "Resolved for the owner",
  SPLIT: "Deposit split",
  DISMISSED: "Dismissed",
};

export default async function DisputeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminModule("BOOKING_MANAGER");
  // Viewing is Booking Manager; deciding needs Deposit Manager.
  const canResolve = await hasAdminModule("DEPOSIT_MANAGER");

  const dispute = await prisma.dispute.findUnique({
    where: { id: params.id },
    include: {
      resolution: true,
      booking: {
        include: {
          client: { select: { id: true, name: true, phone: true, email: true } },
          car: {
            select: {
              make: true,
              model: true,
              year: true,
              licensePlate: true,
              fuelPolicy: true,
              owner: {
                select: {
                  user: { select: { id: true, name: true, phone: true } },
                },
              },
            },
          },
          deposit: { include: { movements: { orderBy: { createdAt: "asc" } } } },
          conditionPhotos: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });

  if (!dispute) notFound();

  const b = dispute.booking;
  const ownerUserId = b.car.owner.user.id;
  const raisedByClient = dispute.raisedById === b.client.id;

  // Map DB rows onto the shape PhotoComparisonView expects. The DB stores a
  // boolean phase and the uploader's id; the component wants labels.
  const photos = b.conditionPhotos.map((p) => ({
    id: p.id,
    url: p.url,
    category: p.caption?.split(" — ")[0] ?? "OTHER",
    phase: (p.isPreTrip ? "PRE_TRIP" : "POST_TRIP") as "PRE_TRIP" | "POST_TRIP",
    uploadedBy: (p.uploadedById === ownerUserId ? "OWNER" : "CLIENT") as
      | "OWNER"
      | "CLIENT",
    createdAt: p.createdAt.toISOString(),
    notes: p.caption?.split(" — ").slice(1).join(" — ") || null,
  }));

  const deposit = b.deposit;
  const depositCollected = deposit ? deposit.status !== "PENDING" : true;

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin/disputes"
          className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-ink"
        >
          <ChevronLeft className="h-3 w-3" />
          Back to disputes
        </Link>
        <PageHeader
          title={TYPE_LABEL[dispute.type] ?? dispute.type}
          subtitle={`${b.reference} · opened ${dispute.createdAt.toLocaleDateString("en-RW")}`}
          action={
            <Badge
              tone={
                dispute.resolution
                  ? "success"
                  : dispute.status === "DISMISSED"
                    ? "neutral"
                    : "danger"
              }
            >
              {dispute.status.toLowerCase().replace(/_/g, " ")}
            </Badge>
          }
        />
      </div>

      {/* The claim */}
      <Card title="The claim">
        <div className="mb-2 flex items-center gap-2">
          {raisedByClient ? (
            <User className="h-4 w-4 text-ink-soft" />
          ) : (
            <Building2 className="h-4 w-4 text-ink-soft" />
          )}
          <span className="text-xs font-semibold text-ink">
            Raised by the {raisedByClient ? "client" : "owner"} —{" "}
            {raisedByClient
              ? (b.client.name ?? "Client")
              : (b.car.owner.user.name ?? "Owner")}
          </span>
        </div>
        <p className="whitespace-pre-wrap rounded-xl bg-bone p-3 text-sm text-ink-muted">
          {dispute.description}
        </p>
      </Card>

      {/* Context */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Trip">
          <dl className="space-y-1.5 text-xs">
            <Row label="Car">
              {b.car.year} {b.car.make} {b.car.model} · {b.car.licensePlate}
            </Row>
            <Row label="Dates">
              {b.startDate.toLocaleDateString("en-RW")} →{" "}
              {b.endDate.toLocaleDateString("en-RW")} ({b.totalDays}d)
            </Row>
            <Row label="Client">
              {b.client.name ?? "—"} · {b.client.phone}
            </Row>
            <Row label="Owner">
              {b.car.owner.user.name ?? "—"} · {b.car.owner.user.phone}
            </Row>
            <Row label="Fuel policy">
              {b.car.fuelPolicy?.type.replace(/_/g, " ").toLowerCase() ?? "—"}
              {b.car.fuelPolicy?.refuelingFee
                ? ` · refuel fee ${formatRWF(b.car.fuelPolicy.refuelingFee)}`
                : ""}
            </Row>
          </dl>
        </Card>

        <Card title="Money at stake">
          <dl className="space-y-1.5 text-xs">
            <Row label="Deposit">
              <span className="font-bold text-ink">
                {formatRWF(deposit?.amount ?? 0)}
              </span>
              {deposit && (
                <span className="ml-2">
                  <Badge
                    tone={
                      deposit.status === "HELD"
                        ? "warn"
                        : deposit.status === "PENDING"
                          ? "neutral"
                          : "success"
                    }
                  >
                    {deposit.status.toLowerCase().replace(/_/g, " ")}
                  </Badge>
                </span>
              )}
            </Row>
            <Row label="Rental subtotal">{formatRWF(b.subtotal)}</Row>
            <Row label="Owner earnings">{formatRWF(b.ownerEarnings)}</Row>
          </dl>

          {deposit && deposit.movements.length > 0 && (
            <div className="mt-3 border-t border-sand pt-3">
              <p className="mb-1.5 text-[11px] font-semibold text-ink-muted">
                Deposit history
              </p>
              <ul className="space-y-1">
                {deposit.movements.map((m) => (
                  <li key={m.id} className="text-[11px] text-ink-soft">
                    <span className="font-medium text-ink">
                      {m.fromStatus.toLowerCase()} → {m.toStatus.toLowerCase()}
                    </span>{" "}
                    · {formatRWF(m.amount)} ·{" "}
                    {m.createdAt.toLocaleDateString("en-RW")}
                    <br />
                    <span className="text-ink-faint">{m.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      {/* Evidence */}
      <Card title={`Condition photos (${photos.length})`}>
        {photos.length === 0 ? (
          <p className="rounded-xl bg-bone px-4 py-6 text-sm text-ink-soft">
            No condition photos were uploaded for this trip, so there is no
            photographic evidence either way.
          </p>
        ) : (
          <PhotoComparisonView photos={photos} title="" />
        )}
      </Card>

      {/* Resolution */}
      {dispute.resolution ? (
        <Card title="Resolution">
          <div className="space-y-2">
            <Badge tone="success">
              {OUTCOME_LABEL[dispute.resolution.outcome] ??
                dispute.resolution.outcome}
            </Badge>
            <p className="whitespace-pre-wrap rounded-xl bg-bone p-3 text-sm text-ink-muted">
              {dispute.resolution.notes}
            </p>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-ink-faint">Returned to client</dt>
                <dd className="font-semibold text-ink">
                  {formatRWF(dispute.resolution.clientRefundAmount)}
                </dd>
              </div>
              <div>
                <dt className="text-ink-faint">Awarded to owner</dt>
                <dd className="font-semibold text-ink">
                  {formatRWF(dispute.resolution.ownerAwardAmount)}
                </dd>
              </div>
            </dl>
            <p className="text-[11px] text-ink-faint">
              Resolved {dispute.resolution.resolvedAt.toLocaleString("en-RW")}
            </p>
          </div>
        </Card>
      ) : canResolve ? (
        <Card title="Resolve this dispute">
          <ResolveDisputeForm
            disputeId={dispute.id}
            depositAmount={deposit?.amount ?? 0}
            depositCollected={depositCollected}
          />
        </Card>
      ) : (
        <Card title="Resolve this dispute">
          <div className="flex items-start gap-2 rounded-xl bg-bone p-3">
            <Lock className="mt-px h-4 w-4 shrink-0 text-ink-faint" />
            <p className="text-xs text-ink-soft">
              Resolving a dispute moves a client&apos;s deposit, so it needs
              Deposit Manager access. You can review the evidence here and hand
              it to someone who has it.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-ink-faint">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}
