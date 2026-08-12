/**
 * /admin/notifications — broadcast tool and delivery log
 *
 * The SMS log is the record of every message the platform has sent, including
 * failures. It's the first place to look when someone says they never got a
 * booking confirmation.
 */

import { prisma } from "@/lib/db";
import { requireAdminModule } from "@/lib/auth";
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

export const metadata = { title: "Notifications — ZuriDrive Admin" };

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

export default async function AdminNotificationsPage() {
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
        title="Notifications"
        subtitle="Send announcements and check what's actually been delivered."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Reachable users" value={all} tone="dark" />
        <StatCard
          label="SMS sent (30d)"
          value={smsTotal}
          hint={smsFailed > 0 ? `${smsFailed} failed` : "all delivered"}
        />
        <StatCard
          label="Failed SMS (30d)"
          value={smsFailed}
          tone={smsFailed > 0 ? "danger" : "default"}
        />
        <StatCard label="In-app (30d)" value={inAppTotal} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink">
          Send a broadcast
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

      <Card title={`SMS delivery log (${smsLogs.length} most recent)`}>
        {smsLogs.length === 0 ? (
          <EmptyRow>
            No SMS sent yet. Every message the platform sends is recorded here.
          </EmptyRow>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr className="border-b border-sand">
                  <Th>When</Th>
                  <Th>To</Th>
                  <Th>Type</Th>
                  <Th>Status</Th>
                  <Th>Message</Th>
                  <Th align="right">Cost</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {smsLogs.map((log) => (
                  <tr key={log.id}>
                    <Td muted>
                      {log.createdAt.toLocaleString("en-RW", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
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
                        {log.status ?? "unknown"}
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
