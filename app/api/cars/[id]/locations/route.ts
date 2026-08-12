/**
 * app/api/cars/[id]/locations/route.ts
 *
 * POST   — add a pickup point to a listing
 * DELETE — remove one (?locationId=...)
 *
 * The third thing an owner could set once and never change. Pickup points were
 * only creatable inside the create-a-car wizard: an owner who moved house, or
 * who wanted to offer a second handover point, had no route to it — the
 * locations page told them to "list a car to add one", which is no help when
 * the car is already listed.
 *
 * New points arrive unapproved and are reviewed at /admin/locations, matching
 * how the wizard already creates them. An owner cannot self-approve a pickup
 * point by adding it here.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireModuleAccess } from "@/lib/api-guard";
import { z } from "zod";

/** Beyond a handful, a pickup dropdown stops being a choice and starts being a list. */
const MAX_LOCATIONS = 6;

const AddSchema = z.object({
  name: z.string().trim().min(2, "Give the pickup point a name.").max(120),
  description: z.string().trim().max(400).optional().nullable(),
  neighborhoodId: z.string().min(1).optional().nullable(),
  deliveryFee: z.number().int().min(0).max(1_000_000).optional().nullable(),
});

async function canEdit(userId: string, carId: string) {
  const car = await prisma.car.findUnique({
    where: { id: carId },
    select: { owner: { select: { userId: true } } },
  });
  if (!car) return false;
  if (car.owner.userId === userId) return true;
  return requireModuleAccess(userId, "FLEET_MANAGER");
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Please sign in to continue." },
        { status: 401 },
      );
    }
    if (!(await canEdit(session.user.id, params.id))) {
      return NextResponse.json(
        { error: "You don't have permission to change this listing." },
        { status: 403 },
      );
    }

    const parsed = AddSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Those details aren't valid." },
        { status: 400 },
      );
    }

    const count = await prisma.ownerLocation.count({
      where: { carId: params.id },
    });
    if (count >= MAX_LOCATIONS) {
      return NextResponse.json(
        { error: `A car can have at most ${MAX_LOCATIONS} pickup points.` },
        { status: 409 },
      );
    }

    const location = await prisma.ownerLocation.create({
      data: {
        carId: params.id,
        ...parsed.data,
        // Always unapproved on creation — approval is a moderator's decision,
        // never a side effect of the owner adding it.
        isApproved: false,
      },
    });

    return NextResponse.json({ success: true, location }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/cars/[id]/locations]", error);
    return NextResponse.json(
      { error: "We couldn’t add that pickup point. Please try again." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Please sign in to continue." },
        { status: 401 },
      );
    }
    if (!(await canEdit(session.user.id, params.id))) {
      return NextResponse.json(
        { error: "You don't have permission to change this listing." },
        { status: 403 },
      );
    }

    const locationId = req.nextUrl.searchParams.get("locationId");
    if (!locationId) {
      return NextResponse.json({ error: "Which pickup point?" }, { status: 400 });
    }

    const location = await prisma.ownerLocation.findUnique({
      where: { id: locationId },
      select: { carId: true },
    });
    if (!location || location.carId !== params.id) {
      return NextResponse.json(
        { error: "Pickup point not found." },
        { status: 404 },
      );
    }

    // A live car with nowhere to collect it from cannot be booked.
    const remaining = await prisma.ownerLocation.count({
      where: { carId: params.id },
    });
    if (remaining <= 1) {
      const car = await prisma.car.findUnique({
        where: { id: params.id },
        select: { status: true, deliverAnywhere: true },
      });
      if (car?.status === "LIVE" && !car.deliverAnywhere) {
        return NextResponse.json(
          {
            error:
              "A live listing needs at least one pickup point, unless you deliver anywhere. Add another first.",
          },
          { status: 409 },
        );
      }
    }

    await prisma.ownerLocation.delete({ where: { id: locationId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/cars/[id]/locations]", error);
    return NextResponse.json(
      { error: "We couldn’t remove that pickup point. Please try again." },
      { status: 500 },
    );
  }
}
