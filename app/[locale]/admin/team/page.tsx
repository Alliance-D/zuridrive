/**
 * /admin/team — sub-admin management and the platform activity log
 *
 * Super Admin only. The activity log is the immutable AdminAction table — the
 * record of every privileged action anyone has taken.
 */

import { getTranslations } from "next-intl/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { PageHeader, Card, StatCard, EmptyRow } from "@/components/admin/ui";
import TeamManager, { type TeamMember } from "@/components/admin/TeamManager";
import { ShieldCheck } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  return { title: `${t("team")} — ZuriDrive Admin` };
}

export default async function AdminTeamPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { page?: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
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
    name: u.name ?? u.email ?? t("adminFallback"),
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
        title={t("team")}
        subtitle={t("teamSub")}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("superAdmins")} value={superAdmins.length} tone="dark" />
        <StatCard label={t("subAdmins")} value={members.length} />
        <StatCard
          label={t("suspended")}
          value={members.filter((m) => m.isSuspended).length}
          tone={members.some((m) => m.isSuspended) ? "warn" : "default"}
        />
        <StatCard label={t("actionsLogged")} value={activityTotal} />
      </div>

      {/* Super admins — listed for visibility, not editable here */}
      <Card title={t("superAdmins")}>
        <ul className="space-y-1.5">
          {superAdmins.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 shrink-0 text-accent" />
              <span className="font-medium text-ink">
                {s.name ?? s.email ?? t("superAdminFallback")}
              </span>
              <span className="text-xs text-ink-faint">{s.phone}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-ink-faint">
          {t("superAdminsNote")}
        </p>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink">{t("subAdmins")}</h2>
        <TeamManager members={members} />
      </div>

      {/* Activity log */}
      <Card title={t("activityLog", { count: activityTotal })}>
        {activity.length === 0 ? (
          <EmptyRow>{t("noActionsYet")}</EmptyRow>
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
                        {a.actor.name ?? a.actor.email ?? t("adminFallback")}
                        {a.actor.role === "SUPER_ADMIN" && t("superSuffix")} ·{" "}
                        {a.actionType.toLowerCase().replace(/_/g, " ")}
                        {a.targetModel && ` · ${a.targetModel}`}
                      </p>
                      {a.reason && (
                        <p className="mt-0.5 text-[11px] text-ink-soft">
                          {t("reasonLabel", { reason: a.reason })}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] text-ink-faint">
                      {formatDateTime(a.createdAt, params.locale)}
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
                    {t("previous")}
                  </a>
                )}
                <span className="text-xs text-ink-soft">
                  {t("pageOf", { page, total: totalPages })}
                </span>
                {page < totalPages && (
                  <a
                    href={`/admin/team?page=${page + 1}`}
                    className="text-xs font-semibold text-brand hover:underline"
                  >
                    {t("next")}
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
