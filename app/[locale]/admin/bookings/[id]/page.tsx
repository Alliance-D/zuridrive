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
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdminModule, hasAdminModule } from "@/lib/auth";
import { formatRWF } from "@/lib/currency";
import { PageHeader, Card, Badge } from "@/components/admin/ui";
import InterveneActions from "@/components/admin/InterveneActions";
import { getAdminActionLog } from "@/lib/admin-logger";
import type { BookingStatus } from "@prisma/client";
import { ChevronLeft, Scale } from "lucide-react";

export const metadata = { title: "Booking — ZuriDrive Admin" };

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
  params: { id: string };
}) {
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
          Back
        </Link>
        <PageHeader
          title={booking.reference}
          subtitle={`${booking.car.year} ${booking.car.make} ${booking.car.model} · ${booking.car.licensePlate}`}
          action={
            <Badge tone={STATUS_TONE[booking.status]}>
              {booking.status.toLowerCase().replace(/_/g, " ")}
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
                ? "Dispute resolved"
                : "Open dispute on this booking"}
            </p>
            <p className="text-xs text-danger">
              {booking.dispute.description.slice(0, 120)}
            </p>
          </div>
        </Link>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Trip">
          <dl className="space-y-1.5 text-xs">
            <Row label="Dates">
              {booking.startDate.toLocaleDateString("en-RW")} →{" "}
              {booking.endDate.toLocaleDateString("en-RW")} ({booking.totalDays}d)
            </Row>
            <Row label="Rental type">
              {booking.rentalType.replace("PER_", "").toLowerCase()}
              {booking.tripScope
                ? ` · ${booking.tripScope.replace("_", " ").toLowerCase()}`
                : ""}
            </Row>
            <Row label="Driver">{booking.driverRequested ? "Yes" : "No"}</Row>
            <Row label="Pickup">
              {booking.location?.platformLocation?.name ??
                booking.location?.ownerLocation?.name ??
                booking.location?.customDescription ??
                "—"}
            </Row>
            <Row label="Photos">{booking.conditionPhotos.length} uploaded</Row>
          </dl>
        </Card>

        <Card title="Parties">
          <dl className="space-y-1.5 text-xs">
            <Row label="Client">
              {booking.client.name ?? "—"}
              <br />
              <span className="text-ink-faint">{booking.client.phone}</span>
            </Row>
            <Row label="Owner">
              {booking.car.owner.user.name ?? "—"}
              <br />
              <span className="text-ink-faint">
                {booking.car.owner.user.phone}
              </span>
            </Row>
            {booking.isGuestBooking && (
              <Row label="Guest booking">
                Yes — {booking.guestName ?? ""}
              </Row>
            )}
          </dl>
        </Card>
      </div>

      {canSeeFinance && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="Money">
            <dl className="space-y-1.5 text-xs">
              <Row label="Base">{formatRWF(booking.baseAmount)}</Row>
              {booking.driverTotal > 0 && (
                <Row label="Driver">{formatRWF(booking.driverTotal)}</Row>
              )}
              {booking.deliveryFee > 0 && (
                <Row label="Delivery">{formatRWF(booking.deliveryFee)}</Row>
              )}
              <Row label="Subtotal">
                <span className="font-semibold">{formatRWF(booking.subtotal)}</span>
              </Row>
              <Row label={`Commission (${booking.commissionRate}%)`}>
                −{formatRWF(booking.commissionAmount)}
              </Row>
              <Row label="Owner earnings">
                <span className="font-semibold text-brand">
                  {formatRWF(booking.ownerEarnings)}
                </span>
              </Row>
              <Row label="Deposit">
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
                      {booking.deposit.status.toLowerCase().replace(/_/g, " ")}
                    </Badge>
                  </span>
                )}
              </Row>
            </dl>
          </Card>

          <Card title="Payments">
            {booking.payments.length === 0 ? (
              <p className="text-xs text-ink-faint">No payment records.</p>
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
                        {p.isVoided ? "voided" : p.status.toLowerCase()}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[11px] text-ink-soft">
                      {p.method === "MTN_MOMO" ? "MoMo" : "Bank transfer"} ·
                      rental {formatRWF(p.rentalAmount)} + deposit{" "}
                      {formatRWF(p.depositAmount)}
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

      <Card title="Admin intervention">
        <InterveneActions
          bookingId={booking.id}
          canCancel={CANCELLABLE.includes(booking.status)}
          canForceComplete={
            booking.status === "ACTIVE" || booking.status === "DISPUTED"
          }
        />
      </Card>

      {auditLog.length > 0 && (
        <Card title="Admin actions on this booking">
          <ul className="space-y-2">
            {auditLog.map((a) => (
              <li key={a.id} className="text-xs">
                <span className="font-medium text-ink">
                  {a.description}
                </span>
                <br />
                <span className="text-[11px] text-ink-faint">
                  {a.actor.name ?? a.actor.email ?? "Admin"} ·{" "}
                  {a.createdAt.toLocaleString("en-RW")}
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
