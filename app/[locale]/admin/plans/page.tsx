/**
 * /admin/plans — subscription plan pricing
 *
 * Super Admin only. requireSuperAdmin() redirects anyone else, and
 * PATCH /api/admin/plans enforces the same rule independently.
 */

import { getTranslations } from "next-intl/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensurePlatformSettings } from "@/lib/platform-settings";
import { PageHeader, Card } from "@/components/admin/ui";
import PlansForm, { type PlanValues } from "@/components/admin/PlansForm";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  return { title: `${t("plans")} — ZuriDrive Admin` };
}

export default async function AdminPlansPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  await requireSuperAdmin();

  const [rows, settings] = await Promise.all([
    prisma.subscriptionPlan.findMany({ orderBy: { priceMonthly: "asc" } }),
    ensurePlatformSettings(),
  ]);

  const plans: PlanValues[] = rows.map((p) => ({
    id: p.id,
    tier: p.tier,
    name: p.name,
    priceMonthly: p.priceMonthly,
    maxListings: p.maxListings,
    commissionRatePercent: p.commissionRatePercent,
    isFeatured: p.isFeatured,
    hasVerifiedBadge: p.hasVerifiedBadge,
    hasHomepageBanner: p.hasHomepageBanner,
    hasPrioritySupport: p.hasPrioritySupport,
    analyticsLevel: p.analyticsLevel,
    isActive: p.isActive,
  }));

  return (
    <div>
      <PageHeader title={t("plans")} subtitle={t("plansSub")} />
      <Card>
        <PlansForm
          initial={plans}
          platformCommission={settings.commissionRatePercent}
        />
      </Card>
    </div>
  );
}
