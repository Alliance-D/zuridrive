// =============================================================================
// ZuriDrive — API Route Guards
//
// Permission checks for API route handlers. Roles come from the Prisma
// UserRole enum (SUPER_ADMIN | SUB_ADMIN | OWNER | CLIENT); fine-grained admin
// permissions come from SubAdminProfile.roleModules (AdminRoleModule[]).
//
// Do NOT use the enum in @/types — it is a legacy shape that conflates roles
// and modules and does not match the database.
//
// These all check the DATABASE, not just the JWT, so a suspension or a revoked
// module takes effect immediately rather than at next token refresh.
// =============================================================================

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { AdminRoleModule, UserRole } from "@prisma/client";

/** Standard JSON responses so every route denies access the same way. */
export const UNAUTHORIZED = () =>
  NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });

export const FORBIDDEN = () =>
  NextResponse.json(
    { error: "You don't have permission to do that." },
    { status: 403 },
  );

/**
 * Returns the signed-in user's id, or null.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user?.id ?? null;
}

/**
 * True if the user holds one of the given roles and is not suspended.
 */
export async function requireRole(
  userId: string,
  roles: UserRole[],
): Promise<boolean> {
  if (!userId) return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isSuspended: true },
  });

  if (!user || user.isSuspended) return false;
  return roles.includes(user.role);
}

/**
 * True if the user may act on a given admin module.
 *
 * SUPER_ADMIN always passes. A SUB_ADMIN passes only when the module is listed
 * on their SubAdminProfile. Everyone else fails.
 */
export async function requireModuleAccess(
  userId: string,
  module: AdminRoleModule,
): Promise<boolean> {
  if (!userId) return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      isSuspended: true,
      subAdminProfile: { select: { roleModules: true } },
    },
  });

  // Suspension is tracked on User — SubAdminProfile has no separate flag.
  if (!user || user.isSuspended) return false;
  if (user.role === "SUPER_ADMIN") return true;
  if (user.role !== "SUB_ADMIN") return false;

  return user.subAdminProfile?.roleModules.includes(module) ?? false;
}

/**
 * True if the user is any kind of admin.
 */
export async function requireAdmin(userId: string): Promise<boolean> {
  return requireRole(userId, ["SUPER_ADMIN", "SUB_ADMIN"]);
}

/**
 * True if the user is a car owner.
 */
export async function requireOwner(userId: string): Promise<boolean> {
  return requireRole(userId, ["OWNER"]);
}

/**
 * True if the user owns the given car — ownership is via CarOwnerProfile,
 * so we compare the profile's userId, not the car's ownerId directly.
 */
export async function ownsCar(userId: string, carId: string): Promise<boolean> {
  const car = await prisma.car.findUnique({
    where: { id: carId },
    select: { owner: { select: { userId: true } } },
  });
  return car?.owner.userId === userId;
}

/**
 * True if the user is a participant in the booking — either the client who
 * booked it or the owner of the car. Used to gate booking detail and actions.
 */
export async function isBookingParticipant(
  userId: string,
  bookingId: string,
): Promise<{ isClient: boolean; isOwner: boolean; allowed: boolean }> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      clientId: true,
      car: { select: { owner: { select: { userId: true } } } },
    },
  });

  if (!booking) return { isClient: false, isOwner: false, allowed: false };

  const isClient = booking.clientId === userId;
  const isOwner = booking.car.owner.userId === userId;

  return { isClient, isOwner, allowed: isClient || isOwner };
}
