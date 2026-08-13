/**
 * /owner/profile — identity and payout details
 *
 * Covers onboarding steps 1 and 2.
 */

import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireOwnerProfile } from "@/lib/owner";
import OwnerProfileForm from "@/components/owner/OwnerProfileForm";
import { CalendarDays, Clock, Car } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "owner" });
  return { title: `${t("profile")} — ZuriDrive` };
}

export default async function OwnerProfilePage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "owner" });
  const { session, profile } = await requireOwnerProfile();

  const [user, carCount] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { name: true, email: true, phone: true },
    }),
    prisma.car.count({ where: { ownerId: profile.id } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink">{t("profile")}</h1>
        <p className="text-sm text-ink-soft">{t("profileSub")}</p>
      </div>

      {/* Public stats — what clients see about you */}
      <div className="grid grid-cols-3 gap-3">
        <MiniStat
          icon={CalendarDays}
          value={profile.memberSince.getFullYear().toString()}
          label={t("memberSince")}
        />
        <MiniStat
          icon={Car}
          value={carCount.toString()}
          label={t("carsListedLabel")}
        />
        <MiniStat
          icon={Clock}
          value={
            profile.avgResponseTimeMinutes
              ? `${profile.avgResponseTimeMinutes}m`
              : "—"
          }
          label={t("avgResponse")}
        />
      </div>

      <OwnerProfileForm
        initial={{
          name: user.name ?? "",
          email: user.email ?? "",
          phone: user.phone,
          ownerType: profile.ownerType,
          businessName: profile.businessName ?? "",
          registrationNumber: profile.registrationNumber ?? "",
          tin: profile.tin ?? "",
          momoNumber: profile.momoNumber ?? "",
          bankName: profile.bankName ?? "",
          bankAccountName: profile.bankAccountName ?? "",
          bankAccountNumber: profile.bankAccountNumber ?? "",
        }}
      />
    </div>
  );
}

function MiniStat({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ElementType;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-3 text-center shadow-sm">
      <Icon className="mx-auto mb-1.5 h-4 w-4 text-brand" />
      <p className="text-lg font-bold text-ink">{value}</p>
      <p className="text-[11px] text-ink-soft">{label}</p>
    </div>
  );
}
