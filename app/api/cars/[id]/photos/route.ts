/**
 * app/api/cars/[id]/photos/route.ts
 *
 * POST   — add a photo to a listing
 * DELETE — remove one (?photoId=...)
 * PATCH  — reorder, which also chooses the cover image
 *
 * Also missing before this. The edit screen listed a car's photos with a COVER
 * badge on the first one and no way to add, remove or reorder any of them, so
 * whichever photo happened to be uploaded first during the create wizard was
 * the cover image forever.
 *
 * Photos are the single biggest factor in whether a listing gets booked, so
 * "you cannot change your photos" is a serious limitation for an owner.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireModuleAccess } from "@/lib/api-guard";
import { uploadedFileUrl } from "@/lib/validation/urls";
import { z } from "zod";

/** Enough to show a car properly; beyond this is a slideshow nobody scrolls. */
const MAX_PHOTOS = 10;

const AddSchema = z.object({
  url: uploadedFileUrl,
  publicId: z.string().min(1).max(300),
});

const ReorderSchema = z.object({
  /** Photo ids, in the order they should appear. First is the cover. */
  order: z.array(z.string().min(1)).min(1).max(MAX_PHOTOS),
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

async function guard(carId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Please sign in to continue." }, { status: 401 }) };
  }
  if (!(await canEdit(session.user.id, carId))) {
    return {
      error: NextResponse.json(
        { error: "You don't have permission to change these photos." },
        { status: 403 },
      ),
    };
  }
  return { userId: session.user.id };
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const g = await guard(params.id);
    if (g.error) return g.error;

    const parsed = AddSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "That doesn't look like a valid uploaded image." },
        { status: 400 },
      );
    }

    const count = await prisma.carPhoto.count({ where: { carId: params.id } });
    if (count >= MAX_PHOTOS) {
      return NextResponse.json(
        { error: `A listing can have at most ${MAX_PHOTOS} photos.` },
        { status: 409 },
      );
    }

    const photo = await prisma.carPhoto.create({
      data: { carId: params.id, ...parsed.data, order: count },
    });

    return NextResponse.json({ success: true, photo }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/cars/[id]/photos]", error);
    return NextResponse.json(
      { error: "We couldn’t add that photo. Please try again." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const g = await guard(params.id);
    if (g.error) return g.error;

    const photoId = req.nextUrl.searchParams.get("photoId");
    if (!photoId) {
      return NextResponse.json({ error: "Which photo?" }, { status: 400 });
    }

    const photo = await prisma.carPhoto.findUnique({ where: { id: photoId } });
    if (!photo || photo.carId !== params.id) {
      return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    }

    // A live listing with no photo is worse than no listing — it looks broken
    // and it will not get booked.
    const remaining = await prisma.carPhoto.count({ where: { carId: params.id } });
    if (remaining <= 1) {
      const car = await prisma.car.findUnique({
        where: { id: params.id },
        select: { status: true },
      });
      if (car?.status === "LIVE") {
        return NextResponse.json(
          {
            error:
              "A live listing needs at least one photo. Add another before removing this one.",
          },
          { status: 409 },
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.carPhoto.delete({ where: { id: photoId } });
      // Close the gap so ordering stays 0,1,2… and the cover is always order 0.
      const rest = await tx.carPhoto.findMany({
        where: { carId: params.id },
        orderBy: { order: "asc" },
        select: { id: true },
      });
      await Promise.all(
        rest.map((p, i) =>
          tx.carPhoto.update({ where: { id: p.id }, data: { order: i } }),
        ),
      );
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/cars/[id]/photos]", error);
    return NextResponse.json(
      { error: "We couldn’t remove that photo. Please try again." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const g = await guard(params.id);
    if (g.error) return g.error;

    const parsed = ReorderSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid order." }, { status: 400 });
    }

    const owned = await prisma.carPhoto.findMany({
      where: { carId: params.id },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((p) => p.id));

    // Every id must belong to this car, and all of them must be present —
    // a partial list would silently leave photos with duplicate order values.
    const ids = parsed.data.order;
    if (ids.length !== owned.length || !ids.every((id) => ownedIds.has(id))) {
      return NextResponse.json(
        { error: "That ordering doesn't match this listing's photos." },
        { status: 400 },
      );
    }

    await prisma.$transaction(
      ids.map((id, i) =>
        prisma.carPhoto.update({ where: { id }, data: { order: i } }),
      ),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PATCH /api/cars/[id]/photos]", error);
    return NextResponse.json(
      { error: "We couldn’t reorder those photos. Please try again." },
      { status: 500 },
    );
  }
}
