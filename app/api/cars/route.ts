import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { z } from "zod";

/**
 * GET /api/cars — public catalogue of live cars.
 * Deliberately unauthenticated: the homepage and /cars listing are public.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const take = Math.min(Number(searchParams.get("limit") ?? 50), 100);

    const cars = await prisma.car.findMany({
      where: {
        status: "LIVE",
        isActive: true,
        ...(category ? { category: category as never } : {}),
      },
      include: {
        // order 0 is the cover photo
        photos: { orderBy: { order: "asc" }, take: 1 },
        pricing: true,
        owner: { select: { hasVerifiedBadge: true, searchPriority: true } },
      },
      // Admin featuring always wins; then the owner's plan priority
      // (1 = Premium, 2 = Pro, 3 = standard); then recency.
      orderBy: [
        { isFeatured: "desc" },
        { owner: { searchPriority: "asc" } },
        { publishedAt: "desc" },
      ],
      take,
    });

    return NextResponse.json({ success: true, data: cars });
  } catch (error) {
    console.error("Failed to fetch cars:", error);
    return NextResponse.json({ error: "Failed to fetch cars" }, { status: 500 });
  }
}

const CreateCarSchema = z.object({
  make: z.string().min(1).max(50),
  model: z.string().min(1).max(50),
  year: z.number().int().min(1980).max(new Date().getFullYear() + 1),
  color: z.string().min(1).max(30),
  licensePlate: z.string().min(3).max(20),
  category: z.enum(["ECONOMY", "SUV", "LUXURY", "VAN", "MINIBUS"]),
  fuelType: z.enum(["PETROL", "DIESEL", "ELECTRIC", "HYBRID"]),
  transmission: z.enum(["AUTOMATIC", "MANUAL"]),
  seatingCapacity: z.number().int().min(1).max(50),

  // Pricing lives on its own table — all values are RWF integers
  perDayInCity: z.number().int().min(0),
  perDayOutsideCity: z.number().int().min(0),
  perWeekInCity: z.number().int().min(0),
  perWeekOutsideCity: z.number().int().min(0),
  perMonth: z.number().int().min(0),
  driverEnabled: z.boolean().default(false),
  driverSurchargePerDay: z.number().int().min(0).optional(),
  depositEnabled: z.boolean().default(false),
  depositAmount: z.number().int().min(0).optional(),
});

/**
 * POST /api/cars — owner creates a car listing (as a DRAFT).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Car.ownerId points at CarOwnerProfile.id — NOT User.id.
    const ownerProfile = await prisma.carOwnerProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!ownerProfile) {
      return NextResponse.json(
        { error: "Only registered car owners can list a vehicle." },
        { status: 403 },
      );
    }

    const parsed = CreateCarSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Please check the car details and try again.",
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const d = parsed.data;

    const car = await prisma.car.create({
      data: {
        ownerId: ownerProfile.id,
        make: d.make,
        model: d.model,
        year: d.year,
        color: d.color,
        licensePlate: d.licensePlate,
        category: d.category,
        fuelType: d.fuelType,
        transmission: d.transmission,
        seatingCapacity: d.seatingCapacity,
        status: "DRAFT",
        pricing: {
          create: {
            perDayInCity: d.perDayInCity,
            perDayOutsideCity: d.perDayOutsideCity,
            perWeekInCity: d.perWeekInCity,
            perWeekOutsideCity: d.perWeekOutsideCity,
            perMonth: d.perMonth,
            driverEnabled: d.driverEnabled,
            driverSurchargePerDay: d.driverSurchargePerDay,
            depositEnabled: d.depositEnabled,
            depositAmount: d.depositAmount,
          },
        },
      },
      include: { pricing: true },
    });

    return NextResponse.json({ success: true, data: car }, { status: 201 });
  } catch (error) {
    console.error("Failed to create car:", error);
    return NextResponse.json({ error: "Failed to create car" }, { status: 500 });
  }
}
