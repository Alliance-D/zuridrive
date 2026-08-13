/**
 * /owner — Owner area guard.
 *
 * Route-level access is already enforced in middleware.ts; this re-checks
 * server-side (middleware only reads the JWT, which can lag a role change)
 * and loads the chrome data the shell needs.
 */

import { redirect } from "next/navigation";
import { localePath, loginPath } from "@/lib/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import OwnerLayout from "@/components/owner/OwnerLayout";

export default async function OwnerAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect(await loginPath("/owner/dashboard"));

  // Super admins can view the owner area for support purposes.
  if (session.user.role !== "OWNER" && session.user.role !== "SUPER_ADMIN") {
    redirect(await localePath("/"));
  }

  const [profile, notificationCount] = await Promise.all([
    prisma.carOwnerProfile.findUnique({
      where: { userId: session.user.id },
      select: { isOnboardingComplete: true },
    }),
    prisma.notification.count({
      where: { userId: session.user.id, isRead: false },
    }),
  ]);

  return (
    <OwnerLayout
      notificationCount={notificationCount}
      isOnboardingComplete={profile?.isOnboardingComplete ?? false}
    >
      {children}
    </OwnerLayout>
  );
}
