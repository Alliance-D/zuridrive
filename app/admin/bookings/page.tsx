/**
 * /admin/bookings — the booking ledger
 *
 * Search across reference, client, owner and plate; filter by status.
 * Rows link to /admin/bookings/[id] where intervention lives.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdminModule, hasAdminModule } from "@/lib/auth";
import { formatRWF } from "@/lib/currency";
import {
  PageHeader,
  StatCard,
  Card,
  Badge,
  EmptyRow,
  SubNav,
  TableWrap,
  Th,
  Td,
} from "@/components/admin/ui";
import type { BookingStatus, Prisma } from "@prisma/client";
import { Search, Scale } from "lucide-react";

export const metadata = { title: "Bookings — ZuriDrive Admin" };

const TONE: Record<
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

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
  await requireAdminModule("BOOKING_MANAGER");
  const canSeeMoney = await hasAdminModule("FINANCE_MANAGER");

  const status = searchParams.status ?? "ALL";
  const q = searchParams.q?.trim() ?? "";

  const where: Prisma.BookingWhereInput = {
    ...(status !== "ALL" ? { status: status as BookingStatus } : {}),
    ...(q
      ? {
          OR: [
            { reference: { contains: q, mode: "insensitive" } },
            { client: { name: { contains: q, mode: "insensitive" } } },
            { client: { phone: { contains: q } } },
            { car: { licensePlate: { contains: q, mode: "insensitive" } } },
            {
              car: {
                owner: { user: { name: { contains: q, mode: "insensitive" } } },
              },
            },
          ],
        }
      : {}),
  };

  const [bookings, total, statusCounts, activeCount, disputedCount] =
    await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          client: { select: { name: true, phone: true } },
          car: {
            select: {
              make: true,
              model: true,
              licensePlate: true,
              owner: { select: { user: { select: { name: true } } } },
            },
          },
          dispute: { select: { id: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.booking.count({ where }),
      prisma.booking.groupBy({ by: ["status"], _count: true }),
      prisma.booking.count({ where: { status: "ACTIVE" } }),
      prisma.booking.count({ where: { status: "DISPUTED" } }),
    ]);

  const countFor = (s: BookingStatus) =>
    statusCounts.find((c) => c.status === s)?._count ?? 0;

  const totalAll = statusCounts.reduce((s, c) => s + c._count, 0);

  return (
    <div>
      <PageHeader
        title="Bookings"
        subtitle="Every booking on the platform."
      />

      <SubNav
        active={`/admin/bookings?status=${status}`}
        items={[
          { label: "All", href: "/admin/bookings?status=ALL" },
          {
            label: "Awaiting owner",
            href: "/admin/bookings?status=AWAITING_OWNER_CONFIRMATION",
            count: countFor("AWAITING_OWNER_CONFIRMATION"),
          },
          { label: "Active", href: "/admin/bookings?status=ACTIVE" },
          {
            label: "Disputed",
            href: "/admin/bookings?status=DISPUTED",
            count: countFor("DISPUTED"),
          },
          { label: "Completed", href: "/admin/bookings?status=COMPLETED" },
          { label: "Cancelled", href: "/admin/bookings?status=CANCELLED" },
        ]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total bookings" value={totalAll} tone="dark" />
        <StatCard label="Active trips" value={activeCount} />
        <StatCard
          label="Disputed"
          value={disputedCount}
          tone={disputedCount > 0 ? "danger" : "default"}
        />
        <StatCard label="Matching filter" value={total} />
      </div>

      <form className="mb-4" action="/admin/bookings">
        <input type="hidden" name="status" value={status} />
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search reference, client, owner or plate…"
            className="w-full rounded-lg border border-sand-dark bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>
      </form>

      <Card
        title={`Showing ${bookings.length}${total > bookings.length ? ` of ${total}` : ""}`}
      >
        {bookings.length === 0 ? (
          <EmptyRow>
            {q ? `Nothing matches “${q}”.` : "No bookings in this view."}
          </EmptyRow>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr className="border-b border-sand">
                  <Th>Reference</Th>
                  <Th>Status</Th>
                  <Th>Car</Th>
                  <Th>Client</Th>
                  <Th>Owner</Th>
                  <Th>Dates</Th>
                  {canSeeMoney && <Th align="right">Subtotal</Th>}
                  {canSeeMoney && <Th align="right">Deposit</Th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {bookings.map((b) => (
                  <tr key={b.id}>
                    <Td>
                      <Link
                        href={`/admin/bookings/${b.id}`}
                        className="font-medium hover:text-brand"
                      >
                        {b.reference}
                      </Link>
                      {b.dispute && (
                        <Scale className="ml-1 inline h-3 w-3 text-danger" />
                      )}
                    </Td>
                    <Td>
                      <Badge tone={TONE[b.status]}>
                        {b.status.toLowerCase().replace(/_/g, " ")}
                      </Badge>
                    </Td>
                    <Td muted>
                      {b.car.make} {b.car.model}
                      <br />
                      <span className="text-[10px] text-ink-faint">
                        {b.car.licensePlate}
                      </span>
                    </Td>
                    <Td muted>{b.client.name ?? b.client.phone}</Td>
                    <Td muted>{b.car.owner.user.name ?? "—"}</Td>
                    <Td muted>
                      {b.startDate.toLocaleDateString("en-RW")}
                      <br />
                      <span className="text-[10px] text-ink-faint">
                        {b.totalDays}d
                      </span>
                    </Td>
                    {canSeeMoney && (
                      <Td align="right">
                        <span className="font-semibold">
                          {formatRWF(b.subtotal)}
                        </span>
                      </Td>
                    )}
                    {canSeeMoney && (
                      <Td align="right" muted>
                        {b.depositAmount ? formatRWF(b.depositAmount) : "—"}
                      </Td>
                    )}
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
