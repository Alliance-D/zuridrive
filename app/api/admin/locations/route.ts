/**
 * app/api/admin/locations/route.ts
 *
 * POST — create a platform pickup location (airport, hotel, bus terminal…).
 *
 * This collection route did not exist. There was only /[id], so an admin could
 * edit or deactivate the locations that came from the seed but could never add
 * a new one — opening a pickup point at a new hotel meant a database migration.
 *
 * Owner-submitted locations are a different model (OwnerLocation) and arrive
 * through the listing wizard for approval; this is only for the platform's own
 * verified points, which appear to every renter in the booking dropdown.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireModuleAccess } from "@/lib/api-guard";
import { z } from "zod";

const CreateLocationSchema = z.object({
  name: z.string().trim().min(2, "Give the location a name.").max(120),
  description: z.string().trim().max(500).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  // Coordinates stay optional throughout — the product deliberately never
  // forces a map on anyone (see PlatformLocation in the schema).
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  isActive: z.boolean().default(true),
  order: z.number().int().min(0).max(9999).default(0),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Please sign in to continue." },
        { status: 401 },
      );
    }

    // CONTENT_MODERATOR covers reviews, owner locations and neighbourhoods
    // (see AdminRoleModule in the schema), so it governs this too.
    const allowed = await requireModuleAccess(
      session.user.id,
      "CONTENT_MODERATOR",
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "You don't have permission to manage locations." },
        { status: 403 },
      );
    }

    const parsed = CreateLocationSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ?? "Those details aren't valid.",
        },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // name is @unique — check first so the admin gets a sentence rather than a
    // Prisma constraint error.
    const clash = await prisma.platformLocation.findUnique({
      where: { name: data.name },
      select: { id: true },
    });
    if (clash) {
      return NextResponse.json(
        { error: `There's already a location called "${data.name}".` },
        { status: 409 },
      );
    }

    const location = await prisma.platformLocation.create({ data });

    return NextResponse.json({ success: true, location }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/admin/locations]", error);
    return NextResponse.json(
      { error: "We couldn’t create that location. Please try again." },
      { status: 500 },
    );
  }
}
