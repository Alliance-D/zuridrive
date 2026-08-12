/**
 * /admin/locations — pickup point moderation
 *
 * Owner locations are created unapproved by the listing wizard, so this queue
 * is the only thing that makes them selectable at booking time. Platform
 * locations (airport, convention centre) are listed for reference — they're
 * always available on every car.
 */

import Link from "next/link";
import AddPlatformLocation from "@/components/admin/AddPlatformLocation";
import { prisma } from "@/lib/db";
import { requireAdminModule } from "@/lib/auth";
import { formatRWF } from "@/lib/currency";
import {
  PageHeader,
  StatCard,
  Card,
  Badge,
  EmptyRow,
  SubNav,
} from "@/components/admin/ui";
import ModerationActions from "@/components/admin/ModerationActions";
import { MapPin, Building2, Check, Clock } from "lucide-react";

export const metadata = { title: "Locations — ZuriDrive Admin" };

export default async function AdminLocationsPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  await requireAdminModule("CONTENT_MODERATOR");

  const filter = searchParams.filter ?? "PENDING";

  const [locations, pendingCount, approvedCount, platformLocations] =
    await Promise.all([
      prisma.ownerLocation.findMany({
        where:
          filter === "ALL" ? {} : { isApproved: filter === "APPROVED" },
        include: {
          neighborhood: { select: { name: true } },
          car: {
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              owner: { select: { user: { select: { name: true, phone: true } } } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 100,
      }),
      prisma.ownerLocation.count({ where: { isApproved: false } }),
      prisma.ownerLocation.count({ where: { isApproved: true } }),
      prisma.platformLocation.findMany({
        where: { isActive: true },
        orderBy: [{ order: "asc" }, { name: "asc" }],
      }),
    ]);

  return (
    <div>
      <PageHeader
        title="Pickup locations"
        subtitle="Approve the custom pickup points owners add to their cars."
      />

      <SubNav
        active={`/admin/locations?filter=${filter}`}
        items={[
          {
            label: "Awaiting review",
            href: "/admin/locations?filter=PENDING",
            count: pendingCount,
          },
          { label: "Approved", href: "/admin/locations?filter=APPROVED" },
          { label: "All", href: "/admin/locations?filter=ALL" },
        ]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="Awaiting review"
          value={pendingCount}
          tone={pendingCount > 0 ? "warn" : "default"}
          hint="Not selectable by clients until approved"
        />
        <StatCard label="Approved" value={approvedCount} tone="dark" />
        <StatCard
          label="ZuriDrive locations"
          value={platformLocations.length}
          hint="Available on every car"
        />
      </div>

      <div className="mb-4">
        <Card title="Owner pickup points">
          {locations.length === 0 ? (
            <EmptyRow>
              {filter === "PENDING"
                ? "Nothing waiting for review."
                : "No locations in this view."}
            </EmptyRow>
          ) : (
            <ul className="divide-y divide-sand">
              {locations.map((l) => (
                <li key={l.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
                        <span className="text-sm font-semibold text-ink">
                          {l.name}
                        </span>
                        <Badge tone={l.isApproved ? "success" : "warn"}>
                          <span className="inline-flex items-center gap-1">
                            {l.isApproved ? (
                              <>
                                <Check className="h-2.5 w-2.5" /> approved
                              </>
                            ) : (
                              <>
                                <Clock className="h-2.5 w-2.5" /> in review
                              </>
                            )}
                          </span>
                        </Badge>
                      </div>

                      {l.description && (
                        <p className="mt-1 text-xs text-ink-muted">
                          {l.description}
                        </p>
                      )}

                      <p className="mt-0.5 text-[11px] text-ink-faint">
                        <Link
                          href={`/cars/${l.car.id}`}
                          className="hover:text-brand"
                        >
                          {l.car.year} {l.car.make} {l.car.model}
                        </Link>{" "}
                        · {l.car.owner.user.name ?? "Owner"} ·{" "}
                        {l.neighborhood?.name ?? "no neighbourhood"}
                        {l.deliveryFee
                          ? ` · ${formatRWF(l.deliveryFee)} delivery`
                          : ""}{" "}
                        · added {l.createdAt.toLocaleDateString("en-RW")}
                      </p>
                    </div>

                    <div className="w-full lg:w-auto">
                      <ModerationActions
                        endpoint={`/api/admin/locations/${l.id}`}
                        actions={
                          l.isApproved
                            ? [
                                {
                                  id: "reject",
                                  label: "Withdraw",
                                  tone: "danger" as const,
                                  needsReason: true,
                                  reasonPlaceholder:
                                    "Why is this being withdrawn?",
                                  warning:
                                    "Clients will no longer be able to choose this pickup point.",
                                },
                              ]
                            : [
                                {
                                  id: "approve",
                                  label: "Approve",
                                  tone: "primary" as const,
                                },
                                {
                                  id: "reject",
                                  label: "Reject",
                                  tone: "danger" as const,
                                  needsReason: true,
                                  reasonPlaceholder:
                                    "What's wrong with this location?",
                                  warning:
                                    "The owner is told why, and the location is removed.",
                                },
                              ]
                        }
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="ZuriDrive locations">
        <p className="mb-3 flex items-center gap-1.5 text-xs text-ink-soft">
          <Building2 className="h-3.5 w-3.5" />
          Available on every listing automatically.
        </p>

        <div className="mb-3">
          <AddPlatformLocation />
        </div>
        <ul className="flex flex-wrap gap-1.5">
          {platformLocations.map((p) => (
            <li
              key={p.id}
              className="rounded-full bg-sand px-2.5 py-1 text-xs text-ink-muted"
            >
              {p.name}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
