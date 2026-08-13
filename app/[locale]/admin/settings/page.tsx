/**
 * /admin/settings — platform configuration
 *
 * Super Admin only. requireSuperAdmin() redirects anyone else, and the API
 * enforces the same rule independently.
 */

import { getTranslations } from "next-intl/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import {
  ensurePlatformSettings,
  SETTING_LIMITS,
} from "@/lib/platform-settings";
import { PageHeader, Card } from "@/components/admin/ui";
import SettingsForm from "@/components/admin/SettingsForm";
import { ShieldAlert } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  return { title: `${t("settings")} — ZuriDrive Admin` };
}

export default async function AdminSettingsPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  await requireSuperAdmin();

  const settings = await ensurePlatformSettings();

  const updatedBy = settings.updatedById
    ? await prisma.user.findUnique({
        where: { id: settings.updatedById },
        select: { name: true, email: true },
      })
    : null;

  // Recent changes to settings, from the audit log.
  const history = await prisma.adminAction.findMany({
    where: {
      actionType: { in: ["PLATFORM_SETTINGS_UPDATED", "COMMISSION_RATE_UPDATED"] },
    },
    include: { actor: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return (
    <div>
      <PageHeader
        title={t("platformSettings")}
        subtitle={t("settingsSub")}
      />

      <div className="mb-4 flex items-start gap-2 rounded-2xl bg-ink p-4 text-white">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="text-xs">
          <p className="font-semibold">{t("superAdminOnly")}</p>
          <p className="mt-0.5 text-white/70">
            {t("superAdminOnlyNote")}
          </p>
        </div>
      </div>

      <SettingsForm
        initial={{
          commissionRatePercent: settings.commissionRatePercent,
          largePayoutThreshold: settings.largePayoutThreshold,
          autoPublishListings: settings.autoPublishListings,
          freeTierMaxListings: settings.freeTierMaxListings,
          lateCancellationWindowHours: settings.lateCancellationWindowHours,
          lateCancellationFeePercent: settings.lateCancellationFeePercent,
          photoRetentionDays: settings.photoRetentionDays,
          ownerConfirmWindowHours: settings.ownerConfirmWindowHours,
          autoCompleteHours: settings.autoCompleteHours,
        }}
        limits={SETTING_LIMITS as unknown as Record<string, { min: number; max: number }>}
      />

      <p className="mt-3 text-[11px] text-ink-faint">
        {updatedBy
          ? t("lastChangedBy", {
              date: formatDateTime(settings.updatedAt, params.locale),
              who: updatedBy.name ?? updatedBy.email ?? t("adminFallback"),
            })
          : t("lastChanged", {
              date: formatDateTime(settings.updatedAt, params.locale),
            })}
      </p>

      {history.length > 0 && (
        <div className="mt-4">
          <Card title={t("recentChanges")}>
            <ul className="space-y-2">
              {history.map((h) => (
                <li key={h.id} className="text-xs">
                  <span className="text-ink">{h.description}</span>
                  <br />
                  <span className="text-[11px] text-ink-faint">
                    {h.actor.name ?? h.actor.email ?? t("adminFallback")} ·{" "}
                    {formatDateTime(h.createdAt, params.locale)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
