/**
 * /admin/users — client and owner accounts
 *
 * Admin accounts are deliberately excluded — they're managed at /admin/team by
 * a Super Admin, so User Manager can't be used as an escalation path.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdminModule } from "@/lib/auth";
import {
  PageHeader,
  StatCard,
  Card,
  Badge,
  EmptyRow,
  SubNav,
} from "@/components/admin/ui";
import ModerationActions from "@/components/admin/ModerationActions";
import type { Prisma, UserRole } from "@prisma/client";
import { Search, BadgeCheck, Car, CalendarDays } from "lucide-react";

export const metadata = { title: "Users — ZuriDrive Admin" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { role?: string; q?: string; status?: string };
}) {
  await requireAdminModule("USER_MANAGER");

  const role = searchParams.role ?? "ALL";
  const status = searchParams.status ?? "ALL";
  const q = searchParams.q?.trim() ?? "";

  const where: Prisma.UserWhereInput = {
    // Never surface admins here.
    role:
      role === "ALL"
        ? { in: ["CLIENT", "OWNER"] }
        : (role as UserRole),
    ...(status === "SUSPENDED" ? { isSuspended: true } : {}),
    ...(status === "UNVERIFIED" ? { phoneVerifiedAt: null } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [users, clientCount, ownerCount, suspendedCount] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        isSuspended: true,
        phoneVerifiedAt: true,
        createdAt: true,
        _count: { select: { bookingsAsClient: true } },
        carOwnerProfile: { select: { _count: { select: { cars: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.user.count({ where: { role: "CLIENT" } }),
    prisma.user.count({ where: { role: "OWNER" } }),
    prisma.user.count({
      where: { role: { in: ["CLIENT", "OWNER"] }, isSuspended: true },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Clients and car owners. Admin accounts live on the Team page."
      />

      <SubNav
        active={`/admin/users?role=${role}`}
        items={[
          { label: "All", href: "/admin/users?role=ALL" },
          { label: "Clients", href: "/admin/users?role=CLIENT" },
          { label: "Owners", href: "/admin/users?role=OWNER" },
          {
            label: "Suspended",
            href: "/admin/users?role=ALL&status=SUSPENDED",
            count: suspendedCount,
          },
        ]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Clients" value={clientCount} tone="dark" />
        <StatCard label="Owners" value={ownerCount} />
        <StatCard
          label="Suspended"
          value={suspendedCount}
          tone={suspendedCount > 0 ? "warn" : "default"}
        />
        <StatCard label="Showing" value={users.length} />
      </div>

      <form className="mb-4" action="/admin/users">
        <input type="hidden" name="role" value={role} />
        <input type="hidden" name="status" value={status} />
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name, phone or email…"
            className="w-full rounded-lg border border-sand-dark bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>
      </form>

      <Card title={`Users (${users.length})`}>
        {users.length === 0 ? (
          <EmptyRow>
            {q ? `Nothing matches “${q}”.` : "No users in this view."}
          </EmptyRow>
        ) : (
          <ul className="divide-y divide-sand">
            {users.map((u) => (
              <li key={u.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">
                        {u.name ?? "Unnamed"}
                      </span>
                      <Badge tone={u.role === "OWNER" ? "info" : "neutral"}>
                        {u.role.toLowerCase()}
                      </Badge>
                      {u.isSuspended && <Badge tone="danger">suspended</Badge>}
                      {u.phoneVerifiedAt && (
                        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-success">
                          <BadgeCheck className="h-3 w-3" />
                          phone verified
                        </span>
                      )}
                    </div>

                    <p className="mt-0.5 text-xs text-ink-soft">
                      {u.phone}
                      {u.email ? ` · ${u.email}` : ""}
                    </p>

                    <p className="mt-0.5 flex flex-wrap items-center gap-3 text-[11px] text-ink-faint">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-2.5 w-2.5" />
                        {u._count.bookingsAsClient} booking
                        {u._count.bookingsAsClient === 1 ? "" : "s"}
                      </span>
                      {u.carOwnerProfile && (
                        <span className="flex items-center gap-1">
                          <Car className="h-2.5 w-2.5" />
                          {u.carOwnerProfile._count.cars} car
                          {u.carOwnerProfile._count.cars === 1 ? "" : "s"}
                        </span>
                      )}
                      <span>
                        joined {u.createdAt.toLocaleDateString("en-RW")}
                      </span>
                    </p>
                  </div>

                  <div className="w-full lg:w-auto">
                    <ModerationActions
                      endpoint={`/api/admin/users/${u.id}`}
                      actions={[
                        u.isSuspended
                          ? { id: "unsuspend", label: "Reinstate", tone: "primary" as const }
                          : {
                              id: "suspend",
                              label: "Suspend",
                              tone: "warn" as const,
                              needsReason: true,
                              reasonPlaceholder: "Why is this account being suspended?",
                              warning: "The user is texted immediately.",
                            },
                        {
                          id: "delete",
                          label: "Delete",
                          tone: "danger" as const,
                          needsReason: true,
                          reasonPlaceholder: "Reason for closing this account",
                          warning:
                            "Personal details are erased but the account row is kept, so bookings and payments stay intact. Accounts with unfinished bookings can't be deleted.",
                        },
                      ]}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
