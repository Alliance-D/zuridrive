/**
 * /admin/users/[id] — one person, in one place.
 *
 * The user list can tell you that somebody exists and let you suspend them.
 * What it cannot do is answer the question support actually gets asked, which
 * is some version of "what happened with my account?" — and answering that by
 * cross-referencing three ledgers while the person waits on the phone is how
 * you end up guessing.
 *
 * So this gathers what a support agent needs to see at once: who they are,
 * what they have booked or listed, what they have paid, and what an admin has
 * previously done to their account.
 *
 * What it deliberately does not show is anything nobody needs to do the job.
 * There is no password material here and no payout credentials — an admin
 * helping with a booking has no business reading somebody's bank details, and
 * the safest way to guarantee that is not to load them.
 */

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ChevronLeft, User as UserIcon } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireAdminModule, hasAdminModule } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/currency";
import { formatPhone } from "@/lib/phone";
import { PageHeader, Card, Badge } from "@/components/admin/ui";
import { getAdminActionLog } from "@/lib/admin-logger";
import ModerationActions from "@/components/admin/ModerationActions";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  return { title: `${t("userDetail")} — ZuriDrive Admin` };
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: { id: string; locale: string };
}) {
  await requireAdminModule("USER_MANAGER");
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });

  // Finance figures are a separate permission. A user manager can see that
  // somebody booked; what they paid is the finance team's business.
  const canSeeFinance = await hasAdminModule("FINANCE_MANAGER");

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      role: true,
      isSuspended: true,
      phoneVerifiedAt: true,
      createdAt: true,
      locale: true,
      country: { select: { code: true, name: true } },

      bookingsAsClient: {
        select: {
          id: true,
          reference: true,
          status: true,
          startDate: true,
          endDate: true,
          currency: true,
          subtotal: true,
          car: { select: { make: true, model: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      },

      carOwnerProfile: {
        select: {
          id: true,
          isOnboardingComplete: true,
          hasVerifiedBadge: true,
          cars: {
            select: {
              id: true,
              make: true,
              model: true,
              licensePlate: true,
              status: true,
              countryCode: true,
            },
            orderBy: { createdAt: "desc" },
            take: 20,
          },
          subscriptions: {
            select: {
              id: true,
              status: true,
              expiresAt: true,
              plan: { select: { name: true } },
            },
            orderBy: { startedAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!user) notFound();

  const owner = user.carOwnerProfile;
  const subscription = owner?.subscriptions[0];

  // What an admin has already done to this account. Support's first question
  // is often "did somebody already deal with this?", and the log answers it.
  const actions = await getAdminActionLog("User", user.id);

  return (
    <div className="space-y-4">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-xs text-ink-soft no-underline hover:text-brand"
      >
        <ChevronLeft size={14} />
        {t("backToUsers")}
      </Link>

      <PageHeader
        title={user.name ?? t("unnamedUser")}
        subtitle={formatPhone(user.phone, user.country?.code ?? "RW")}
        action={
          <ModerationActions
            endpoint={`/api/admin/users/${user.id}`}
            actions={[
              user.isSuspended
                ? { id: "unsuspend", label: t("reinstate"), tone: "primary" as const }
                : {
                    id: "suspend",
                    label: t("suspend"),
                    tone: "warn" as const,
                    needsReason: true,
                    reasonPlaceholder: t("suspendReason"),
                    warning: t("suspendWarning"),
                  },
            ]}
          />
        }
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title={t("account")}>
          <dl className="space-y-1.5 text-xs">
            <Row label={t("colRole")}>
              <Badge tone={user.role === "SUPER_ADMIN" ? "info" : "neutral"}>
                {user.role}
              </Badge>
            </Row>
            <Row label={t("colStatus")}>
              {user.isSuspended ? (
                <Badge tone="danger">{t("suspended")}</Badge>
              ) : (
                <Badge tone="success">{t("active")}</Badge>
              )}
            </Row>
            <Row label={t("colPhone")}>
              {formatPhone(user.phone, user.country?.code ?? "RW")}
              {user.phoneVerifiedAt ? (
                <span className="ml-2 text-ink-faint">{t("verified")}</span>
              ) : (
                <span className="ml-2 text-warn">{t("unverified")}</span>
              )}
            </Row>
            <Row label={t("colEmail")}>{user.email ?? "—"}</Row>
            <Row label={t("colCountry")}>{user.country?.name ?? "—"}</Row>
            <Row label={t("colLanguage")}>{user.locale ?? "—"}</Row>
            <Row label={t("joined")}>{formatDate(user.createdAt, params.locale)}</Row>
          </dl>
        </Card>

        {owner && (
          <Card title={t("ownerProfile")}>
            <dl className="space-y-1.5 text-xs">
              <Row label={t("onboarding")}>
                {owner.isOnboardingComplete ? (
                  <Badge tone="success">{t("complete")}</Badge>
                ) : (
                  <Badge tone="warn">{t("incomplete")}</Badge>
                )}
              </Row>
              <Row label={t("verifiedBadge")}>
                {owner.hasVerifiedBadge ? t("yes") : t("no")}
              </Row>
              <Row label={t("plan")}>
                {subscription
                  ? `${subscription.plan.name} — ${subscription.status}`
                  : t("noPlan")}
              </Row>
              {subscription?.expiresAt && (
                <Row label={t("renews")}>{formatDate(subscription.expiresAt, params.locale)}</Row>
              )}
              <Row label={t("carsListed")}>{owner.cars.length}</Row>
            </dl>
          </Card>
        )}
      </div>

      {owner && owner.cars.length > 0 && (
        <Card title={t("theirCars")}>
          <ul className="divide-y divide-sand text-xs">
            {owner.cars.map((car) => (
              <li key={car.id} className="flex items-center justify-between py-2">
                <Link
                  href={`/admin/fleet/${car.id}`}
                  className="text-ink no-underline hover:text-brand"
                >
                  {car.make} {car.model}
                  <span className="ml-2 text-ink-faint">{car.licensePlate}</span>
                </Link>
                <Badge tone={car.status === "LIVE" ? "success" : "neutral"}>
                  {car.status}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {user.bookingsAsClient.length > 0 && (
        <Card title={t("theirBookings")}>
          <ul className="divide-y divide-sand text-xs">
            {user.bookingsAsClient.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Link
                    href={`/admin/bookings/${b.id}`}
                    className="text-ink no-underline hover:text-brand"
                  >
                    {b.reference}
                  </Link>
                  <span className="ml-2 text-ink-faint">
                    {b.car.make} {b.car.model}
                  </span>
                  <span className="block text-ink-faint">
                    {formatDate(b.startDate, params.locale)} — {formatDate(b.endDate, params.locale)}
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <Badge tone={b.status === "COMPLETED" ? "success" : "neutral"}>
                    {b.status}
                  </Badge>
                  {canSeeFinance && (
                    <span className="mt-1 block text-ink-faint">
                      {/* The booking's own currency, not the viewer's: a trip
                          booked in Kampala reads UGX here. */}
                      {formatMoney(b.subtotal, b.currency)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {actions.length > 0 && (
        <Card title={t("adminHistory")}>
          <ul className="divide-y divide-sand text-xs">
            {actions.map((a) => (
              <li key={a.id} className="py-2">
                <span className="text-ink">{a.actionType}</span>
                <span className="ml-2 text-ink-faint">
                  {a.actor?.name ?? t("unknownAdmin")} ·{" "}
                  {formatDateTime(a.createdAt, params.locale)}
                </span>
                {a.reason && (
                  <span className="block text-ink-faint">{a.reason}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-ink-faint">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}
