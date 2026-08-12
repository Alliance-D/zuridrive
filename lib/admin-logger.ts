// =============================================================================
// ZuriDrive — Admin Audit Logger
//
// Every privileged action must land in the AdminAction table. Records are
// append-only: never updated, never deleted.
//
// Logging must never break the operation it is recording — if the write fails
// we log loudly to the server console and carry on, rather than throwing and
// rolling back a deposit release that already happened.
// =============================================================================

import { prisma } from "@/lib/prisma";
import { Prisma, type AdminActionType } from "@prisma/client";

export interface AdminActionData {
  /** Admin or sub-admin performing the action. */
  actorId: string;
  /** Must be a member of the AdminActionType enum. */
  action: AdminActionType;
  /** Model name of the affected entity — "Booking", "Deposit", "Car", ... */
  targetType?: string;
  /** Id of the affected entity. Free-form: not a foreign key. */
  targetId?: string;
  /** Set only when the target is genuinely a User — this one IS a foreign key. */
  targetUserId?: string;
  /** Human-readable summary. Falls back to the action name. */
  description?: string;
  /** Required by policy for suspensions, deletions and financial actions. */
  reason?: string;
  /** Extra context — old/new values, amounts, booking refs. */
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
}

export async function logAdminAction(data: AdminActionData): Promise<void> {
  try {
    await prisma.adminAction.create({
      data: {
        actorId: data.actorId,
        actionType: data.action,
        targetModel: data.targetType ?? null,
        targetId: data.targetId ?? null,
        targetUserId: data.targetUserId ?? null,
        description: data.description ?? humanize(data.action),
        reason: data.reason ?? null,
        metadata: data.metadata ?? Prisma.JsonNull,
        ipAddress: data.ipAddress ?? null,
      },
    });
  } catch (error) {
    // Never rethrow — see header note.
    console.error("[AdminLogger] Failed to record admin action:", error, {
      actorId: data.actorId,
      action: data.action,
      targetId: data.targetId,
    });
  }
}

/**
 * Fetches the audit trail for a single entity, newest first.
 */
export async function getAdminActionLog(targetType: string, targetId: string) {
  return prisma.adminAction.findMany({
    where: { targetModel: targetType, targetId },
    include: {
      actor: { select: { id: true, name: true, email: true, phone: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** DEPOSIT_PARTIALLY_WITHHELD → "Deposit partially withheld" */
function humanize(action: AdminActionType): string {
  const words = action.toLowerCase().split("_");
  return words[0].charAt(0).toUpperCase() + words[0].slice(1) + " " + words.slice(1).join(" ");
}
