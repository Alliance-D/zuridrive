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
 * A change ends every existing session. NextAuth issues stateless JWTs, so
 * there is nothing to delete; User.sessionsValidFrom records the moment and
 * lib/auth-options.ts refuses any token issued before it. That includes the
 * device making the change, which then signs in again with the new password.
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
      data: {
        passwordHash: await hashPassword(parsed.data.newPassword),
        // Ends every session issued before now, including this one — see the
        // revocation check in lib/auth-options.ts. Changing a password because
        // you think someone else has it should not leave their device signed
        // in for the remaining thirty days of its token.
        sessionsValidFrom: new Date(),
      },
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
