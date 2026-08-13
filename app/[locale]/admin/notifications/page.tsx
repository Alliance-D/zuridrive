/**
 * /admin/notifications — broadcast tool and delivery log
 *
 * The SMS log is the record of every message the platform has sent, including
 * failures. It's the first place to look when someone says they never got a
 * booking confirmation.
 */

import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireAdminModule } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import {
  PageHeader,
  StatCard,
  Card,
  Badge,
  EmptyRow,
  TableWrap,
  Th,
  Td,
} from "@/components/admin/ui";
import BroadcastForm from "@/components/admin/BroadcastForm";
import type { Prisma, UserRole } from "@prisma/client";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  return { title: `${t("notifications")} — ZuriDrive Admin` };
}

function audienceWhere(audience: string): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { isSuspended: false };
  switch (audience) {
    case "CLIENTS":
      return { ...base, role: "CLIENT" as UserRole };
    case "OWNERS":
      return { ...base, role: "OWNER" as UserRole };
    case "ACTIVE_OWNERS":
      return {
        ...base,
        role: "OWNER" as UserRole,
        carOwnerProfile: { cars: { some: { status: "LIVE", isActive: true } } },
      };
    default:
      return { ...base, role: { in: ["CLIENT", "OWNER"] } };
  }
}

export default async function AdminNotificationsPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  await requireAdminModule("COMMUNICATIONS");

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [all, clients, owners, activeOwners, smsLogs, smsTotal, smsFailed, inAppTotal] =
    await Promise.all([
      prisma.user.count({ where: audienceWhere("ALL") }),
      prisma.user.count({ where: audienceWhere("CLIENTS") }),
      prisma.user.count({ where: audienceWhere("OWNERS") }),
      prisma.user.count({ where: audienceWhere("ACTIVE_OWNERS") }),
      prisma.smsLog.findMany({
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.smsLog.count({ where: { createdAt: { gte: since } } }),
      prisma.smsLog.count({
        where: { createdAt: { gte: since }, NOT: { status: "Success" } },
      }),
      prisma.notification.count({ where: { createdAt: { gte: since } } }),
    ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("notifications")}
        subtitle={t("notificationsSub")}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("reachableUsers")} value={all} tone="dark" />
        <StatCard
          label={t("smsSent30d")}
          value={smsTotal}
          hint={
            smsFailed > 0
              ? t("smsFailedCount", { count: smsFailed })
              : t("allDelivered")
          }
        />
        <StatCard
          label={t("smsFailed30d")}
          value={smsFailed}
          tone={smsFailed > 0 ? "danger" : "default"}
        />
        <StatCard label={t("inApp30d")} value={inAppTotal} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink">
          {t("sendBroadcast")}
        </h2>
        <BroadcastForm
          audienceSizes={{
            ALL: all,
            CLIENTS: clients,
            OWNERS: owners,
            ACTIVE_OWNERS: activeOwners,
          }}
        />
      </div>

      <Card title={t("smsLog", { count: smsLogs.length })}>
        {smsLogs.length === 0 ? (
          <EmptyRow>
            {t("noSmsYet")}
          </EmptyRow>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr className="border-b border-sand">
                  <Th>{t("colWhen")}</Th>
                  <Th>{t("colTo")}</Th>
                  <Th>{t("colType")}</Th>
                  <Th>{t("colStatus")}</Th>
                  <Th>{t("colMessage")}</Th>
                  <Th align="right">{t("colCost")}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {smsLogs.map((log) => (
                  <tr key={log.id}>
                    <Td muted>
                      {formatDateTime(log.createdAt, params.locale)}
                    </Td>
                    <Td muted>
                      {log.user?.name ?? "—"}
                      <br />
                      <span className="text-[10px] text-ink-faint">
                        {log.phone}
                      </span>
                    </Td>
                    <Td muted>
                      {log.type.toLowerCase().replace(/_/g, " ")}
                    </Td>
                    <Td>
                      <Badge
                        tone={log.status === "Success" ? "success" : "danger"}
                      >
                        {log.status ?? t("unknown")}
                      </Badge>
                    </Td>
                    <Td muted>
                      <span className="block max-w-xs truncate">
                        {log.message}
                      </span>
                    </Td>
                    <Td align="right" muted>
                      {log.cost ?? "—"}
                    </Td>
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
