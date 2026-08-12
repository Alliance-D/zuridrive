/**
 * /dashboard/profile — Client Profile Page
 *
 * Server component wrapper — loads current profile data, passes to
 * ProfileForm (client component) for editing.
 * Supports: name, phone (with OTP re-verification), email and profile photo.
 *
 * ZuriDrive does not collect national ID numbers or driving licence documents
 * — see /privacy and /terms, which both say so explicitly. Renters show their
 * ID to the owner in person at handover instead.
 */

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ProfileForm from "@/components/dashboard/ProfileForm";
import { ProfileSkeleton } from "@/components/dashboard/DashboardSkeletons";

// ─── Data fetcher ─────────────────────────────────────────────────────────────

async function getProfile(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id:                    true,
      name:                  true,
      phone:                 true,
      email:                 true,
      profilePhoto:          true,
      createdAt:             true,
    },
  });
  return user;
}

// ─── Inner content ─────────────────────────────────────────────────────────────

async function ProfileContent({ userId }: { userId: string }) {
  const [user, unreadCount] = await Promise.all([
    getProfile(userId),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return (
    <DashboardLayout notificationCount={unreadCount}>
      <div className="space-y-2 mb-5">
        <h1 className="text-xl font-bold text-ink">My Profile</h1>
        <p className="text-sm text-ink-soft">
          Keep your details accurate — they&apos;re used on every booking.
        </p>
      </div>
      <ProfileForm
        userId={user.id}
        initialData={{
          name:                  user.name  ?? "",
          phone:                 user.phone ?? "",
          email:                 user.email ?? "",
          profilePhotoUrl:       user.profilePhoto ?? "",
        }}
        memberSince={user.createdAt}
      />
    </DashboardLayout>
  );
}

// ─── Page export ───────────────────────────────────────────────────────────────

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login?next=/dashboard/profile");

  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <ProfileSkeleton />
        </DashboardLayout>
      }
    >
      <ProfileContent userId={session.user.id} />
    </Suspense>
  );
}
