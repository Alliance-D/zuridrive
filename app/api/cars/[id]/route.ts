import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ownsCar, requireModuleAccess } from "@/lib/api-guard";
import { z } from "zod";

/**
 * GET /api/cars/[id] — public car detail.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const car = await prisma.car.findUnique({
      where: { id: params.id },
      include: {
        photos: { orderBy: { order: "asc" } },
        pricing: true,
        fuelPolicy: true,
        availability: true,
        locations: true,
        owner: {
          select: {
            avgResponseTimeMinutes: true,
            memberSince: true,
            hasVerifiedBadge: true,
            user: { select: { name: true, profilePhoto: true } },
          },
        },
        reviews: {
          where: { isVisible: true },
          orderBy: { createdAt: "desc" },
          include: { reply: true },
        },
      },
    });

    if (!car) {
      return NextResponse.json({ error: "Car not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: car });
  } catch (error) {
    console.error("Failed to fetch car:", error);
    return NextResponse.json({ error: "Failed to fetch car" }, { status: 500 });
  }
}

/**
 * Fields an OWNER is allowed to change on their own listing.
 *
 * `status`, `isFeatured` and `ownerId` are deliberately absent — those are
 * admin-only and must never be settable from an owner-facing request, or an
 * owner could self-approve or self-feature a listing.
 */
const UpdateCarSchema = z.object({
  make: z.string().min(1).max(50).optional(),
  model: z.string().min(1).max(50).optional(),
  year: z.number().int().min(1980).max(new Date().getFullYear() + 1).optional(),
  color: z.string().min(1).max(30).optional(),
  licensePlate: z.string().min(3).max(20).optional(),
  category: z.enum(["ECONOMY", "SUV", "LUXURY", "VAN", "MINIBUS"]).optional(),
  fuelType: z.enum(["PETROL", "DIESEL", "ELECTRIC", "HYBRID"]).optional(),
  transmission: z.enum(["AUTOMATIC", "MANUAL"]).optional(),
  seatingCapacity: z.number().int().min(1).max(50).optional(),
  minBookingDays: z.number().int().min(1).optional(),
  deliverAnywhere: z.boolean().optional(),
  deliveryFee: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Owners may edit their own cars; Fleet Managers may edit any.
    const isOwner = await ownsCar(session.user.id, params.id);
    const isFleetAdmin = await requireModuleAccess(
      session.user.id,
      "FLEET_MANAGER",
    );

    if (!isOwner && !isFleetAdmin) {
      return NextResponse.json(
        { error: "You don't have permission to edit this car." },
        { status: 403 },
      );
    }

    const parsed = UpdateCarSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Please check the car details and try again.",
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const car = await prisma.car.update({
      where: { id: params.id },
      data: parsed.data,
    });

    return NextResponse.json({ success: true, data: car });
  } catch (error) {
    console.error("Failed to update car:", error);
    return NextResponse.json({ error: "Failed to update car" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isOwner = await ownsCar(session.user.id, params.id);
    const isFleetAdmin = await requireModuleAccess(
      session.user.id,
      "FLEET_MANAGER",
    );

    if (!isOwner && !isFleetAdmin) {
      return NextResponse.json(
        { error: "You don't have permission to remove this car." },
        { status: 403 },
      );
    }

    // A car with booking history must never be hard-deleted — that would
    // orphan financial records. Retire it instead.
    const bookingCount = await prisma.booking.count({
      where: { carId: params.id },
    });

    if (bookingCount > 0) {
      await prisma.car.update({
        where: { id: params.id },
        data: { isActive: false, status: "SUSPENDED" },
      });

      return NextResponse.json({
        success: true,
        archived: true,
        message:
          "This car has booking history, so it has been retired rather than deleted.",
      });
    }

    await prisma.car.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true, archived: false });
  } catch (error) {
    console.error("Failed to delete car:", error);
    return NextResponse.json({ error: "Failed to delete car" }, { status: 500 });
  }
}
