/**
 * /admin/team — sub-admin management and the platform activity log
 *
 * Super Admin only. The activity log is the immutable AdminAction table — the
 * record of every privileged action anyone has taken.
 */

import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, StatCard, EmptyRow } from "@/components/admin/ui";
import TeamManager, { type TeamMember } from "@/components/admin/TeamManager";
import { ShieldCheck } from "lucide-react";

export const metadata = { title: "Team — ZuriDrive Admin" };

export default async function AdminTeamPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  await requireSuperAdmin();

  const page = Math.max(1, Number(searchParams.page ?? 1));
  const PAGE_SIZE = 30;

  const [superAdmins, subAdmins, activity, activityTotal] = await Promise.all([
    prisma.user.findMany({
      where: { role: "SUPER_ADMIN" },
      select: { id: true, name: true, email: true, phone: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({
      where: { role: "SUB_ADMIN" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isSuspended: true,
        createdAt: true,
        subAdminProfile: { select: { roleModules: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.adminAction.findMany({
      include: { actor: { select: { name: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.adminAction.count(),
  ]);

  const members: TeamMember[] = subAdmins.map((u) => ({
    id: u.id,
    name: u.name ?? u.email ?? "Admin",
    email: u.email,
    phone: u.phone,
    isSuspended: u.isSuspended,
    roleModules: u.subAdminProfile?.roleModules ?? [],
    createdAt: u.createdAt.toISOString(),
  }));

  const totalPages = Math.ceil(activityTotal / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Team"
        subtitle="Who has admin access, and everything they've done."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Super admins" value={superAdmins.length} tone="dark" />
        <StatCard label="Sub-admins" value={members.length} />
        <StatCard
          label="Suspended"
          value={members.filter((m) => m.isSuspended).length}
          tone={members.some((m) => m.isSuspended) ? "warn" : "default"}
        />
        <StatCard label="Actions logged" value={activityTotal} />
      </div>

      {/* Super admins — listed for visibility, not editable here */}
      <Card title="Super admins">
        <ul className="space-y-1.5">
          {superAdmins.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 shrink-0 text-accent" />
              <span className="font-medium text-ink">
                {s.name ?? s.email ?? "Super Admin"}
              </span>
              <span className="text-xs text-ink-faint">{s.phone}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-ink-faint">
          Super admins have every permission and can&apos;t be edited from this
          screen — that has to happen in the database, deliberately.
        </p>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink">Sub-admins</h2>
        <TeamManager members={members} />
      </div>

      {/* Activity log */}
      <Card title={`Activity log (${activityTotal})`}>
        {activity.length === 0 ? (
          <EmptyRow>No admin actions recorded yet.</EmptyRow>
        ) : (
          <>
            <ul className="divide-y divide-sand">
              {activity.map((a) => (
                <li key={a.id} className="py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink">
                        {a.description}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-faint">
                        {a.actor.name ?? a.actor.email ?? "Admin"}
                        {a.actor.role === "SUPER_ADMIN" && " (super)"} ·{" "}
                        {a.actionType.toLowerCase().replace(/_/g, " ")}
                        {a.targetModel && ` · ${a.targetModel}`}
                      </p>
                      {a.reason && (
                        <p className="mt-0.5 text-[11px] text-ink-soft">
                          Reason: {a.reason}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] text-ink-faint">
                      {a.createdAt.toLocaleString("en-RW", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-center gap-3 border-t border-sand pt-3">
                {page > 1 && (
                  <a
                    href={`/admin/team?page=${page - 1}`}
                    className="text-xs font-semibold text-brand hover:underline"
                  >
                    Previous
                  </a>
                )}
                <span className="text-xs text-ink-soft">
                  Page {page} of {totalPages}
                </span>
                {page < totalPages && (
                  <a
                    href={`/admin/team?page=${page + 1}`}
                    className="text-xs font-semibold text-brand hover:underline"
                  >
                    Next
                  </a>
                )}
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
