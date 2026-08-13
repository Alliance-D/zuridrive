/**
 * /owner/notifications — owner notification centre
 *
 * The owner shell provides the chrome, so this only renders the list.
 */

import { getTranslations } from "next-intl/server";
import { requireOwnerProfile } from "@/lib/owner";
import { prisma } from "@/lib/db";
import NotificationCenter, {
  type NotificationItem,
} from "@/components/notifications/NotificationCenter";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "owner" });
  return { title: `${t("notifications")} — ZuriDrive` };
}

export default async function OwnerNotificationsPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "owner" });
  const { session } = await requireOwnerProfile();

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
    actionUrl: n.actionUrl,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-ink">{t("notifications")}</h1>
        <p className="text-sm text-ink-soft">{t("notificationsSub")}</p>
      </div>
      <NotificationCenter initial={items} unreadCount={unreadCount} />
    </div>
  );
}
