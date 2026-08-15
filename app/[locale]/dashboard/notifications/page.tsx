/**
 * /dashboard/notifications — client notification centre
 */

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { loginPath } from "@/lib/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import NotificationCenter, {
  type NotificationItem,
} from "@/components/notifications/NotificationCenter";

export const metadata = { title: "Notifications — ZuriDrive" };

export default async function ClientNotificationsPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "dashboard" });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect(await loginPath("/dashboard/notifications"));

  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.notification.count({
      where: { userId: session.user.id, isRead: false },
    }),
  ]);

  const items: NotificationItem[] = rows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    titleKey: n.titleKey,
    bodyKey: n.bodyKey,
    params: (n.params as Record<string, string | number> | null) ?? null,
    actionUrl: n.actionUrl,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <DashboardLayout notificationCount={unreadCount}>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-ink">{t("notifications")}</h1>
        <p className="text-sm text-ink-soft">
          {t("notificationsSub")}
        </p>
      </div>
      <NotificationCenter initial={items} unreadCount={unreadCount} />
    </DashboardLayout>
  );
}
