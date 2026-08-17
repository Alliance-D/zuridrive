/**
 * app/api/me/password/route.ts
 *
 * PUT /api/me/password — set or change the signed-in user's password.
 *
 * Two cases, and the difference matters:
 *
 *   • Changing an existing password requires the current one. Without that,
 *     anyone who finds an unattended logged-in phone owns the account for good.
 *
 *   • Setting a first password requires nothing extra, because there is nothing
 *     to prove. Accounts created by a guest booking, and every account created
 *     before signup asked for a password, have none — and being signed in is
 *     already the strongest claim available to them.
 *
 * Every change ends the other sessions implicitly: NextAuth JWTs stay valid
 * until they expire, so this is not a full revocation. Worth knowing rather
 * than assuming otherwise.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { passwordSchema } from "@/lib/password-policy";
import { z } from "zod";

const Schema = z.object({
  /** Required only when one is already set. */
  currentPassword: z.string().max(200).optional(),
  newPassword: passwordSchema,
});

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    }

    const parsed = Schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            "Use at least 8 characters for your password.",
        },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, passwordHash: true, isSuspended: true },
    });

    if (!user || user.isSuspended) {
      return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    }

    if (user.passwordHash) {
      const current = parsed.data.currentPassword ?? "";
      if (!current) {
        return NextResponse.json(
          { error: "Enter your current password." },
          { status: 400 },
        );
      }
      const ok = await verifyPassword(current, user.passwordHash);
      if (!ok) {
        return NextResponse.json(
          { error: "That is not your current password." },
          { status: 403 },
        );
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(parsed.data.newPassword) },
    });

    return NextResponse.json({ success: true, hadPassword: !!user.passwordHash });
  } catch (error) {
    console.error("[PUT /api/me/password]", error);
    return NextResponse.json(
      { error: "We couldn’t update your password. Please try again." },
      { status: 500 },
    );
  }
}
