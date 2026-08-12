import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { z } from "zod";

/**
 * GET /api/reviews — the signed-in client's own reviews.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const reviews = await prisma.review.findMany({
      where: { clientId: session.user.id },
      include: {
        car: { include: { photos: { orderBy: { order: "asc" }, take: 1 } } },
        reply: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: reviews });
  } catch (error) {
    console.error("Failed to fetch reviews:", error);
    return NextResponse.json(
      { error: "Failed to fetch reviews" },
      { status: 500 },
    );
  }
}

// Four category ratings, 1–5 each. overallRating is derived, never supplied.
const CreateReviewSchema = z.object({
  bookingId: z.string().cuid(),
  cleanlinessRating: z.number().int().min(1).max(5),
  comfortRating: z.number().int().min(1).max(5),
  valueRating: z.number().int().min(1).max(5),
  communicationRating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

/**
 * POST /api/reviews — a client reviews a completed trip.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = CreateReviewSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Please rate all four categories before submitting.",
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const d = parsed.data;

    // The booking must exist, belong to this client, and be finished.
    const booking = await prisma.booking.findUnique({
      where: { id: d.bookingId },
      select: { id: true, carId: true, clientId: true, status: true, review: true },
    });

    if (!booking || booking.clientId !== session.user.id) {
      return NextResponse.json(
        { error: "We couldn't find that booking." },
        { status: 404 },
      );
    }

    if (booking.status !== "COMPLETED") {
      return NextResponse.json(
        { error: "You can only review a trip once it's complete." },
        { status: 400 },
      );
    }

    if (booking.review) {
      return NextResponse.json(
        { error: "You've already reviewed this trip." },
        { status: 409 },
      );
    }

    const overallRating =
      (d.cleanlinessRating +
        d.comfortRating +
        d.valueRating +
        d.communicationRating) /
      4;

    const review = await prisma.review.create({
      data: {
        bookingId: booking.id,
        carId: booking.carId,
        clientId: session.user.id,
        cleanlinessRating: d.cleanlinessRating,
        comfortRating: d.comfortRating,
        valueRating: d.valueRating,
        communicationRating: d.communicationRating,
        overallRating,
        comment: d.comment,
      },
    });

    return NextResponse.json({ success: true, data: review }, { status: 201 });
  } catch (error) {
    console.error("Failed to create review:", error);
    return NextResponse.json(
      { error: "Failed to create review" },
      { status: 500 },
    );
  }
}
