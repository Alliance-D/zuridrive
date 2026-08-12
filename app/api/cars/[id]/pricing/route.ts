/**
 * app/api/cars/[id]/pricing/route.ts
 *
 * PUT /api/cars/[id]/pricing — set or update a car's rates.
 *
 * This did not exist. The owner's edit screen showed pricing as a read-only
 * summary labelled "edited elsewhere", and there was no elsewhere: an owner who
 * mistyped a daily rate, or whose costs changed, had no way to correct it. The
 * only route to a price was the create-a-car wizard, which they had already
 * been through.
 *
 * PRICING IS A SNAPSHOT, NOT A LIVE LOOKUP. Bookings copy the rates in force at
 * the moment they are made (see lib/booking/pricing.ts), so changing a price
 * here never alters what an existing booking costs. That is deliberate, and it
 * is why this endpoint does not need to touch anything but the matrix.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireModuleAccess } from "@/lib/api-guard";
import { z } from "zod";

/** Whole francs. Fractional currency here would break the integer ledger. */
const rate = z
  .number()
  .int("Rates must be whole francs.")
  .min(0)
  .max(50_000_000);

const PricingSchema = z
  .object({
    perDayInCity: rate,
    perDayOutsideCity: rate,
    perWeekInCity: rate,
    perWeekOutsideCity: rate,
    perMonth: rate,
    driverEnabled: z.boolean().default(false),
    driverSurchargePerDay: rate.default(0),
    depositEnabled: z.boolean().default(false),
    depositAmount: rate.nullable().default(null),
  })
  .refine((d) => !d.depositEnabled || (d.depositAmount ?? 0) > 0, {
    message: "Set a deposit amount, or turn the deposit off.",
    path: ["depositAmount"],
  })
  .refine((d) => !d.driverEnabled || d.driverSurchargePerDay > 0, {
    message: "Set a driver surcharge, or turn the driver option off.",
    path: ["driverSurchargePerDay"],
  })
  // A car nobody can afford to book by the day is almost always a typo — a
  // weekly rate above seven daily rates means renting longer costs more.
  .refine((d) => d.perWeekInCity <= d.perDayInCity * 7 || d.perDayInCity === 0, {
    message:
      "The weekly rate is higher than seven days at the daily rate. Renting for longer should not cost more.",
    path: ["perWeekInCity"],
  });

async function ownsCar(userId: string, carId: string) {
  const car = await prisma.car.findUnique({
    where: { id: carId },
    select: { owner: { select: { userId: true } } },
  });
  return car?.owner.userId === userId;
}

export async function PUT(
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

    const isOwner = await ownsCar(session.user.id, params.id);
    const isFleetAdmin = await requireModuleAccess(
      session.user.id,
      "FLEET_MANAGER",
    );

    if (!isOwner && !isFleetAdmin) {
      return NextResponse.json(
        { error: "You don't have permission to price this car." },
        { status: 403 },
      );
    }

    const parsed = PricingSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Those rates aren't valid.",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const d = parsed.data;

    const pricing = await prisma.pricingMatrix.upsert({
      where: { carId: params.id },
      update: d,
      create: { carId: params.id, ...d },
    });

    return NextResponse.json({ success: true, pricing });
  } catch (error) {
    console.error("[PUT /api/cars/[id]/pricing]", error);
    return NextResponse.json(
      { error: "We couldn’t save those rates. Please try again." },
      { status: 500 },
    );
  }
}
