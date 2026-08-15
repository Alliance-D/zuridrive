// =============================================================================
// ZuriDrive — In-app Notification Service
//
// Notification types and channels come from the Prisma enums — do NOT declare a
// parallel enum here, or the two drift apart and writes fail at runtime.
// =============================================================================

import { prisma } from "@/lib/prisma";
import {
  Prisma,
  NotificationChannel,
  type AdminRoleModule,
  type NotificationType,
} from "@prisma/client";

// Re-exported so callers can `import { NotificationType } from "@/lib/notifications"`.
export { NotificationChannel };
export type { NotificationType };

/**
 * Values interpolated into a notification message.
 *
 * This is where text a person actually wrote belongs — an admin's rejection
 * reason, the notes on a resolved dispute. The surrounding sentence is
 * translated; their words are passed through as written, because translating
 * them would put words in their mouth.
 */
export type NotificationParams = Record<string, string | number>;

export interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  /**
   * Rendered English. Still required: it is what an SMS sends, and what the
   * in-app list falls back to for rows written before keys existed.
   */
  title: string;
  /** Notification body. `message` is accepted as an alias. */
  body?: string;
  message?: string;
  /**
   * Keys under the `notification` namespace in messages/*.json. When present
   * the in-app list renders these instead of title/body, so the same row reads
   * in whichever language the reader is browsing.
   */
  titleKey?: string;
  bodyKey?: string;
  params?: NotificationParams;
  /** Where clicking the notification should take the user. */
  actionUrl?: string;
  channel?: NotificationChannel;
  metadata?: Prisma.InputJsonValue;
}

export async function createNotification(
  data: CreateNotificationData,
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        channel: data.channel ?? NotificationChannel.IN_APP,
        title: data.title,
        body: data.body ?? data.message ?? "",
        titleKey: data.titleKey ?? null,
        bodyKey: data.bodyKey ?? null,
        params: data.params ?? Prisma.JsonNull,
        actionUrl: data.actionUrl ?? null,
        metadata: data.metadata ?? Prisma.JsonNull,
      },
    });
  } catch (error) {
    // A failed notification must never break the action that triggered it.
    console.error("[Notifications] Failed to create notification:", error);
  }
}

/**
 * Fans a notification out to every admin who holds a given module — plus all
 * super admins, who implicitly hold everything.
 *
 * Notification.userId is required, so admin-wide alerts are one row per admin
 * rather than a single null-user broadcast.
 */
export async function notifyAdminsWithModule(
  module: AdminRoleModule,
  payload: {
    type: NotificationType;
    title: string;
    body: string;
    titleKey?: string;
    bodyKey?: string;
    params?: NotificationParams;
    actionUrl?: string;
    metadata?: Prisma.InputJsonValue;
  },
): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: {
        isSuspended: false,
        OR: [
          { role: "SUPER_ADMIN" },
          {
            role: "SUB_ADMIN",
            subAdminProfile: { roleModules: { has: module } },
          },
        ],
      },
      select: { id: true },
    });

    if (admins.length === 0) return;

    await prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        type: payload.type,
        channel: NotificationChannel.IN_APP,
        title: payload.title,
        body: payload.body,
        titleKey: payload.titleKey ?? null,
        bodyKey: payload.bodyKey ?? null,
        params: payload.params ?? Prisma.JsonNull,
        actionUrl: payload.actionUrl ?? null,
        metadata: payload.metadata ?? Prisma.JsonNull,
      })),
    });
  } catch (error) {
    console.error("[Notifications] Failed to notify admins:", error);
  }
}

export async function getUserNotifications(userId: string, limit = 50) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

export async function markNotificationAsRead(notificationId: string) {
  return prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true, readAt: new Date() },
  });
}

export async function markAllNotificationsAsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}
