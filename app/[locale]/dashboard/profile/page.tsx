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
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { loginPath } from "@/lib/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMonth } from "@/lib/dates";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ProfileForm from "@/components/dashboard/ProfileForm";
import PasswordSection from "@/components/dashboard/PasswordSection";
import LanguageSection from "@/components/dashboard/LanguageSection";
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
      locale:                true,
      // Only whether one exists — the hash itself never leaves the server.
      passwordHash:          true,
    },
  });
  return user;
}

// ─── Inner content ─────────────────────────────────────────────────────────────

async function ProfileContent({
  userId,
  locale,
}: {
  userId: string;
  locale: string;
}) {
  const t = await getTranslations({ locale, namespace: "dashboard" });
  const [user, unreadCount] = await Promise.all([
    getProfile(userId),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return (
    <DashboardLayout notificationCount={unreadCount}>
      <div className="space-y-2 mb-5">
        <h1 className="text-xl font-bold text-ink">{t("myProfile")}</h1>
        <p className="text-sm text-ink-soft">
          {t("keepDetailsAccurate")}
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
        // Formatted here rather than in the client component: the browser's
        // Intl has no Kinyarwanda month names and falls back to English, which
        // both mismatched hydration and showed the wrong language.
        memberSince={formatMonth(user.createdAt, locale)}
      />

      <div className="mt-5 grid gap-5">
        <PasswordSection hasPassword={user.passwordHash !== null} />
        <LanguageSection saved={user.locale} />
      </div>
    </DashboardLayout>
  );
}

// ─── Page export ───────────────────────────────────────────────────────────────

export default async function ProfilePage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "dashboard" });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect(await loginPath("/dashboard/profile"));

  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <ProfileSkeleton />
        </DashboardLayout>
      }
    >
      <ProfileContent userId={session.user.id} locale={params.locale} />
    </Suspense>
  );
}
