/**
 * /admin/bookings/[id] — booking detail for admins
 *
 * The single place that shows a booking's full financial and lifecycle state.
 * Linked from the finance ledgers and the dispute queue.
 *
 * (The filterable booking list is step 14; this is the detail view step 12
 * needs so intervention has somewhere to live.)
 */

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { formatDate, formatDateTime } from "@/lib/dates";
import { getEnumLabeller } from "@/lib/enum-labels";
import { prisma } from "@/lib/db";
import { requireAdminModule, hasAdminModule } from "@/lib/auth";
import { formatRWF } from "@/lib/currency";
import { PageHeader, Card, Badge } from "@/components/admin/ui";
import InterveneActions from "@/components/admin/InterveneActions";
import { getAdminActionLog } from "@/lib/admin-logger";
import type { BookingStatus } from "@prisma/client";
import { ChevronLeft, Scale } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  return { title: `${t("bookingDetail")} — ZuriDrive Admin` };
}

const STATUS_TONE: Record<
  BookingStatus,
  "neutral" | "info" | "warn" | "success" | "danger"
> = {
  PENDING_PAYMENT: "neutral",
  PAYMENT_CONFIRMED: "info",
  AWAITING_OWNER_CONFIRMATION: "warn",
  CONFIRMED: "success",
  ACTIVE: "info",
  COMPLETED: "success",
  CANCELLED: "neutral",
  DISPUTED: "danger",
};

const CANCELLABLE: BookingStatus[] = [
  "PENDING_PAYMENT",
  "PAYMENT_CONFIRMED",
  "AWAITING_OWNER_CONFIRMATION",
  "CONFIRMED",
];

export default async function AdminBookingDetailPage({
  params,
}: {
  params: { id: string; locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  const label = await getEnumLabeller(params.locale);
  await requireAdminModule("BOOKING_MANAGER");
  const canSeeFinance = await hasAdminModule("FINANCE_MANAGER");

  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
    include: {
      client: { select: { id: true, name: true, phone: true, email: true } },
      car: {
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          licensePlate: true,
          owner: {
            select: { user: { select: { id: true, name: true, phone: true } } },
          },
        },
      },
      location: { include: { platformLocation: true, ownerLocation: true } },
      payments: { orderBy: { createdAt: "desc" } },
      deposit: { include: { movements: { orderBy: { createdAt: "asc" } } } },
      commission: true,
      dispute: { include: { resolution: true } },
      conditionPhotos: { where: { isDeleted: false } },
    },
  });

  if (!booking) notFound();

  const auditLog = await getAdminActionLog("Booking", booking.id);

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin"
          className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-ink"
        >
          <ChevronLeft className="h-3 w-3" />
          {t("back")}
        </Link>
        <PageHeader
          title={booking.reference}
          subtitle={`${booking.car.year} ${booking.car.make} ${booking.car.model} · ${booking.car.licensePlate}`}
          action={
            <Badge tone={STATUS_TONE[booking.status]}>
              {label("bookingStatus", booking.status)}
            </Badge>
          }
        />
      </div>

      {booking.dispute && (
        <Link
          href={`/admin/disputes/${booking.dispute.id}`}
          className="flex items-center gap-3 rounded-2xl bg-danger-bg p-4 hover:opacity-90"
        >
          <Scale className="h-5 w-5 shrink-0 text-danger" />
          <div className="flex-1">
            <p className="text-sm font-bold text-danger">
              {booking.dispute.resolution
                ? t("disputeResolved")
                : t("openDisputeOnBooking")}
            </p>
            <p className="text-xs text-danger">
              {booking.dispute.description.slice(0, 120)}
            </p>
          </div>
        </Link>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title={t("trip")}>
          <dl className="space-y-1.5 text-xs">
            <Row label={t("rowDates")}>
              {t("datesRange", {
                from: formatDate(booking.startDate, params.locale),
                to: formatDate(booking.endDate, params.locale),
                days: booking.totalDays,
              })}
            </Row>
            <Row label={t("rowRentalType")}>
              {label("rentalType", booking.rentalType)}
              {booking.tripScope
                ? ` · ${label("tripScope", booking.tripScope)}`
                : ""}
            </Row>
            <Row label={t("rowDriver")}>
              {booking.driverRequested ? t("yes") : t("no")}
            </Row>
            <Row label={t("rowPickup")}>
              {booking.location?.platformLocation?.name ??
                booking.location?.ownerLocation?.name ??
                booking.location?.customDescription ??
                "—"}
            </Row>
            <Row label={t("rowPhotos")}>
              {t("photosUploaded", { count: booking.conditionPhotos.length })}
            </Row>
          </dl>
        </Card>

        <Card title={t("parties")}>
          <dl className="space-y-1.5 text-xs">
            <Row label={t("colClient")}>
              {booking.client.name ?? "—"}
              <br />
              <span className="text-ink-faint">{booking.client.phone}</span>
            </Row>
            <Row label={t("colOwner")}>
              {booking.car.owner.user.name ?? "—"}
              <br />
              <span className="text-ink-faint">
                {booking.car.owner.user.phone}
              </span>
            </Row>
            {booking.isGuestBooking && (
              <Row label={t("rowGuestBooking")}>
                {t("guestYes", { name: booking.guestName ?? "" })}
              </Row>
            )}
          </dl>
        </Card>
      </div>

      {canSeeFinance && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card title={t("money")}>
            <dl className="space-y-1.5 text-xs">
              <Row label={t("rowBase")}>{formatRWF(booking.baseAmount)}</Row>
              {booking.driverTotal > 0 && (
                <Row label={t("rowDriver")}>{formatRWF(booking.driverTotal)}</Row>
              )}
              {booking.deliveryFee > 0 && (
                <Row label={t("rowDelivery")}>{formatRWF(booking.deliveryFee)}</Row>
              )}
              <Row label={t("rowSubtotal")}>
                <span className="font-semibold">{formatRWF(booking.subtotal)}</span>
              </Row>
              <Row label={t("commissionPercent", { rate: booking.commissionRate })}>
                −{formatRWF(booking.commissionAmount)}
              </Row>
              <Row label={t("rowOwnerEarnings")}>
                <span className="font-semibold text-brand">
                  {formatRWF(booking.ownerEarnings)}
                </span>
              </Row>
              <Row label={t("rowDeposit")}>
                {formatRWF(booking.depositAmount)}
                {booking.deposit && (
                  <span className="ml-2">
                    <Badge
                      tone={
                        booking.deposit.status === "HELD"
                          ? "warn"
                          : booking.deposit.status === "PENDING"
                            ? "neutral"
                            : "success"
                      }
                    >
                      {label("depositStatus", booking.deposit.status)}
                    </Badge>
                  </span>
                )}
              </Row>
            </dl>
          </Card>

          <Card title={t("payments")}>
            {booking.payments.length === 0 ? (
              <p className="text-xs text-ink-faint">{t("noPaymentRecords")}</p>
            ) : (
              <ul className="space-y-2">
                {booking.payments.map((p) => (
                  <li
                    key={p.id}
                    className={`rounded-lg bg-bone p-2.5 ${p.isVoided ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-ink">
                        {formatRWF(p.totalAmount)}
                      </span>
                      <Badge
                        tone={
                          p.isVoided
                            ? "neutral"
                            : p.status === "CONFIRMED"
                              ? "success"
                              : p.status === "FAILED"
                                ? "danger"
                                : "warn"
                        }
                      >
                        {p.isVoided
                          ? t("voided")
                          : label("paymentStatus", p.status)}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[11px] text-ink-soft">
                      {p.method === "MTN_MOMO" ? "MoMo" : t("bankTransfer")} ·{" "}
                      {t("paymentBreakdown", {
                        rental: formatRWF(p.rentalAmount),
                        deposit: formatRWF(p.depositAmount),
                      })}
                    </p>
                    {p.voidReason && (
                      <p className="mt-0.5 text-[11px] text-danger">
                        {p.voidReason}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <Card title={t("adminIntervention")}>
        <InterveneActions
          bookingId={booking.id}
          canCancel={CANCELLABLE.includes(booking.status)}
          canForceComplete={
            booking.status === "ACTIVE" || booking.status === "DISPUTED"
          }
        />
      </Card>

      {auditLog.length > 0 && (
        <Card title={t("adminActionsOnBooking")}>
          <ul className="space-y-2">
            {auditLog.map((a) => (
              <li key={a.id} className="text-xs">
                <span className="font-medium text-ink">
                  {a.description}
                </span>
                <br />
                <span className="text-[11px] text-ink-faint">
                  {a.actor.name ?? a.actor.email ?? t("adminFallback")} ·{" "}
                  {formatDateTime(a.createdAt, params.locale)}
                  {a.reason && ` · ${a.reason}`}
                </span>
              </li>
            ))}
          </ul>
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
