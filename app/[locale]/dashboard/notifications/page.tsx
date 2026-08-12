/**
 * /dashboard/notifications — client notification centre
 */

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import NotificationCenter, {
  type NotificationItem,
} from "@/components/notifications/NotificationCenter";

export const metadata = { title: "Notifications — ZuriDrive" };

export default async function ClientNotificationsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login?next=/dashboard/notifications");

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
    <DashboardLayout notificationCount={unreadCount}>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-ink">Notifications</h1>
        <p className="text-sm text-ink-soft">
          Updates about your bookings, payments and deposits.
        </p>
      </div>
      <NotificationCenter initial={items} unreadCount={unreadCount} />
    </DashboardLayout>
  );
}
