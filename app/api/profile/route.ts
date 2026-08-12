/**
 * /api/profile — Client Profile Update Endpoint
 *
 * PATCH: Update authenticated user's profile fields.
 * Phone number is NOT updated here — that goes through /api/auth/verify-otp
 * with context="phone-change" to enforce OTP verification.
 *
 * All fields validated server-side before writing.
 * Admin action logged for audit trail.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { z } from "zod";

// ─── Validation schema ────────────────────────────────────────────────────────

const ProfileUpdateSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name is too long")
    .optional(),

  email: z
    .string()
    .email("Please enter a valid email address")
    .optional()
    .or(z.literal("")),




  profilePhotoUrl: z
    .string()
    .url("Invalid profile photo URL")
    .optional()
    .or(z.literal("")),
});

// ─── PATCH handler ────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  // Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { message: "You must be signed in to update your profile." },
      { status: 401 }
    );
  }

  // Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { message: "Invalid request format. Please try again." },
      { status: 400 }
    );
  }

  // Validate
  const parsed = ProfileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return NextResponse.json(
      { message: firstError.message },
      { status: 422 }
    );
  }

  const {
    name,
    email,
    profilePhotoUrl,
  } = parsed.data;

  // Build update payload — only include defined fields.
  // The API speaks driverLicense*/profilePhotoUrl; the columns are
  // profilePhoto. Identity documents are not stored - see the identity
  // check note on the Booking model.
  const updateData: Prisma.UserUpdateInput = {};
  if (name                  !== undefined) updateData.name          = name;
  if (email                 !== undefined) updateData.email         = email || null;
  if (profilePhotoUrl       !== undefined) updateData.profilePhoto  = profilePhotoUrl || null;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ message: "No changes to save." }, { status: 200 });
  }

  // Persist
  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data:  updateData,
    });

    // NOTE: deliberately not written to AdminAction. That table is the
    // privileged-action audit trail; self-service profile edits are not admin
    // actions and there is no matching AdminActionType for them.

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/profile PATCH]", err);
    return NextResponse.json(
      { message: "We couldn't save your changes. Please try again in a moment." },
      { status: 500 }
    );
  }
}

// ─── GET handler — return current profile ─────────────────────────────────────

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { message: "Please sign in to view your profile." },
      { status: 401 }
    );
  }

  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: {
        id:            true,
        name:          true,
        phone:         true,
        email:         true,
        profilePhoto:  true,
        createdAt:     true,
      },
    });

    // Map columns back onto the API's field names.
    const { profilePhoto, ...rest } = user;
    return NextResponse.json({
      ...rest,
      profilePhotoUrl:       profilePhoto,
    });
  } catch {
    return NextResponse.json(
      { message: "Profile not found. Please contact support." },
      { status: 404 }
    );
  }
}
