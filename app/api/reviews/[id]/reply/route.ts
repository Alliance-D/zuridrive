import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { z } from "zod";

const ReplySchema = z.object({
  reply: z.string().min(1).max(2000),
});

/**
 * POST /api/reviews/[id]/reply — the car's owner replies to a review.
 *
 * Replies live in their own ReviewReply table (one per review) rather than as
 * columns on Review, so the review record itself stays immutable.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = ReplySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please write a reply before submitting." },
        { status: 400 },
      );
    }

    const review = await prisma.review.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        reply: true,
        car: { select: { owner: { select: { userId: true } } } },
      },
    });

    if (!review) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    // Only the owner of the reviewed car may reply.
    if (review.car.owner.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Only the car's owner can reply to this review." },
        { status: 403 },
      );
    }

    if (review.reply) {
      return NextResponse.json(
        { error: "You've already replied to this review." },
        { status: 409 },
      );
    }

    const reply = await prisma.reviewReply.create({
      data: {
        reviewId: review.id,
        authorId: session.user.id,
        content: parsed.data.reply,
      },
    });

    return NextResponse.json({ success: true, data: reply }, { status: 201 });
  } catch (error) {
    console.error("Failed to reply to review:", error);
    return NextResponse.json(
      { error: "Failed to reply to review" },
      { status: 500 },
    );
  }
}
