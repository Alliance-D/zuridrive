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
import { getTranslations } from "next-intl/server";
import { formatDate, formatDateTime } from "@/lib/dates";
import { getEnumLabeller } from "@/lib/enum-labels";
import { ChevronLeft, Scale, User, Building2, Lock } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  return { title: `${t("disputeDetail")} — ZuriDrive Admin` };
}

export default async function DisputeDetailPage({
  params,
}: {
  params: { id: string; locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  const label = await getEnumLabeller(params.locale);
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
          {t("backToDisputes")}
        </Link>
        <PageHeader
          title={label("disputeTypeLong", dispute.type)}
          subtitle={t("disputeSubtitle", {
            reference: b.reference,
            date: formatDate(dispute.createdAt, params.locale),
          })}
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
              {label("disputeStatus", dispute.status)}
            </Badge>
          }
        />
      </div>

      {/* The claim */}
      <Card title={t("theClaim")}>
        <div className="mb-2 flex items-center gap-2">
          {raisedByClient ? (
            <User className="h-4 w-4 text-ink-soft" />
          ) : (
            <Building2 className="h-4 w-4 text-ink-soft" />
          )}
          <span className="text-xs font-semibold text-ink">
            {raisedByClient
              ? t("raisedByClient", {
                  name: b.client.name ?? t("clientFallback"),
                })
              : t("raisedByOwner", {
                  name: b.car.owner.user.name ?? t("ownerFallback"),
                })}
          </span>
        </div>
        <p className="whitespace-pre-wrap rounded-xl bg-bone p-3 text-sm text-ink-muted">
          {dispute.description}
        </p>
      </Card>

      {/* Context */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card title={t("trip")}>
          <dl className="space-y-1.5 text-xs">
            <Row label={t("rowCar")}>
              {b.car.year} {b.car.make} {b.car.model} · {b.car.licensePlate}
            </Row>
            <Row label={t("rowDates")}>
              {t("datesRange", {
                from: formatDate(b.startDate, params.locale),
                to: formatDate(b.endDate, params.locale),
                days: b.totalDays,
              })}
            </Row>
            <Row label={t("colClient")}>
              {b.client.name ?? "—"} · {b.client.phone}
            </Row>
            <Row label={t("colOwner")}>
              {b.car.owner.user.name ?? "—"} · {b.car.owner.user.phone}
            </Row>
            <Row label={t("rowFuelPolicy")}>
              {b.car.fuelPolicy
                ? label("fuelPolicyLong", b.car.fuelPolicy.type)
                : "—"}
              {b.car.fuelPolicy?.refuelingFee
                ? ` · ${t("refuelFee", {
                    amount: formatRWF(b.car.fuelPolicy.refuelingFee),
                  })}`
                : ""}
            </Row>
          </dl>
        </Card>

        <Card title={t("moneyAtStake")}>
          <dl className="space-y-1.5 text-xs">
            <Row label={t("rowDeposit")}>
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
                    {label("depositStatus", deposit.status)}
                  </Badge>
                </span>
              )}
            </Row>
            <Row label={t("rowRentalSubtotal")}>{formatRWF(b.subtotal)}</Row>
            <Row label={t("rowOwnerEarnings")}>{formatRWF(b.ownerEarnings)}</Row>
          </dl>

          {deposit && deposit.movements.length > 0 && (
            <div className="mt-3 border-t border-sand pt-3">
              <p className="mb-1.5 text-[11px] font-semibold text-ink-muted">
                {t("depositHistory")}
              </p>
              <ul className="space-y-1">
                {deposit.movements.map((m) => (
                  <li key={m.id} className="text-[11px] text-ink-soft">
                    <span className="font-medium text-ink">
                      {t("movementLine", {
                        from: label("depositMovement", m.fromStatus),
                        to: label("depositMovement", m.toStatus),
                      })}
                    </span>{" "}
                    · {formatRWF(m.amount)} ·{" "}
                    {formatDate(m.createdAt, params.locale)}
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
      <Card title={t("conditionPhotos", { count: photos.length })}>
        {photos.length === 0 ? (
          <p className="rounded-xl bg-bone px-4 py-6 text-sm text-ink-soft">
            {t("noConditionPhotos")}
          </p>
        ) : (
          <PhotoComparisonView photos={photos} title="" />
        )}
      </Card>

      {/* Resolution */}
      {dispute.resolution ? (
        <Card title={t("resolution")}>
          <div className="space-y-2">
            <Badge tone="success">
              {label("resolutionOutcome", dispute.resolution.outcome)}
            </Badge>
            <p className="whitespace-pre-wrap rounded-xl bg-bone p-3 text-sm text-ink-muted">
              {dispute.resolution.notes}
            </p>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-ink-faint">{t("returnedToClient")}</dt>
                <dd className="font-semibold text-ink">
                  {formatRWF(dispute.resolution.clientRefundAmount)}
                </dd>
              </div>
              <div>
                <dt className="text-ink-faint">{t("awardedToOwner")}</dt>
                <dd className="font-semibold text-ink">
                  {formatRWF(dispute.resolution.ownerAwardAmount)}
                </dd>
              </div>
            </dl>
            <p className="text-[11px] text-ink-faint">
              {t("resolvedOn", {
                date: formatDateTime(
                  dispute.resolution.resolvedAt,
                  params.locale,
                ),
              })}
            </p>
          </div>
        </Card>
      ) : canResolve ? (
        <Card title={t("resolveThisDispute")}>
          <ResolveDisputeForm
            disputeId={dispute.id}
            depositAmount={deposit?.amount ?? 0}
            depositCollected={depositCollected}
          />
        </Card>
      ) : (
        <Card title={t("resolveThisDispute")}>
          <div className="flex items-start gap-2 rounded-xl bg-bone p-3">
            <Lock className="mt-px h-4 w-4 shrink-0 text-ink-faint" />
            <p className="text-xs text-ink-soft">
              {t("needsDepositManager")}
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
