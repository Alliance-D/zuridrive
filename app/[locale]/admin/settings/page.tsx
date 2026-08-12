/**
 * /admin/settings — platform configuration
 *
 * Super Admin only. requireSuperAdmin() redirects anyone else, and the API
 * enforces the same rule independently.
 */

import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ensurePlatformSettings,
  SETTING_LIMITS,
} from "@/lib/platform-settings";
import { PageHeader, Card } from "@/components/admin/ui";
import SettingsForm from "@/components/admin/SettingsForm";
import { ShieldAlert } from "lucide-react";

export const metadata = { title: "Settings — ZuriDrive Admin" };

export default async function AdminSettingsPage() {
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
        title="Platform settings"
        subtitle="Configuration that affects the whole platform."
      />

      <div className="mb-4 flex items-start gap-2 rounded-2xl bg-ink p-4 text-white">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="text-xs">
          <p className="font-semibold">Super Admin only</p>
          <p className="mt-0.5 text-white/70">
            No sub-admin role grants access here, including Finance Manager.
            Every change is recorded with the old and new value.
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
        Last changed {settings.updatedAt.toLocaleString("en-RW")}
        {updatedBy ? ` by ${updatedBy.name ?? updatedBy.email}` : ""}.
      </p>

      {history.length > 0 && (
        <div className="mt-4">
          <Card title="Recent changes">
            <ul className="space-y-2">
              {history.map((h) => (
                <li key={h.id} className="text-xs">
                  <span className="text-ink">{h.description}</span>
                  <br />
                  <span className="text-[11px] text-ink-faint">
                    {h.actor.name ?? h.actor.email ?? "Admin"} ·{" "}
                    {h.createdAt.toLocaleString("en-RW")}
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
