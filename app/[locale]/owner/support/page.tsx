/**
 * /owner/support — the owner's support tickets.
 *
 * This is the visible half of SubscriptionPlan.hasPrioritySupport. The banner
 * states the response target as a number of hours rather than as a tier name,
 * because "priority support" means nothing to someone waiting on a payout —
 * "we reply within 4 hours" does.
 *
 * An owner without priority still gets a stated target. A support promise the
 * free tier can't see the edges of would be worse than no promise.
 */

import { Link } from "@/i18n/navigation";
import { redirect } from "next/navigation";
import { loginPath } from "@/lib/navigation";
import { getTranslations } from "next-intl/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolvePriority, FIRST_RESPONSE_HOURS } from "@/lib/support";
import { formatDate } from "@/lib/dates";
import { getEnumLabeller } from "@/lib/enum-labels";
import NewTicketForm from "@/components/support/NewTicketForm";
import { Zap, MessageSquare, ArrowRight } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "owner" });
  return { title: `${t("support")} — ZuriDrive` };
}

export default async function OwnerSupportPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "owner" });
  const label = await getEnumLabeller(params.locale);
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect(await loginPath("/owner/support"));

  const [priority, tickets] = await Promise.all([
    resolvePriority(session.user.id),
    prisma.supportTicket.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { messages: true } } },
    }),
  ]);

  const responseHours = priority.isPriority
    ? FIRST_RESPONSE_HOURS.priority
    : FIRST_RESPONSE_HOURS.standard;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-ink">{t("support")}</h1>
        <p className="text-xs text-ink-soft">{t("supportSub")}</p>
      </div>

      {/* The promise, stated in hours */}
      <div
        className={`rounded-2xl p-4 ${
          priority.isPriority ? "bg-brand text-white" : "bg-white shadow-sm"
        }`}
      >
        <div className="flex items-start gap-2.5">
          <Zap
            className={`mt-0.5 h-4 w-4 shrink-0 ${
              priority.isPriority ? "text-accent" : "text-ink-faint"
            }`}
          />
          <div className="text-xs">
            <p
              className={`font-semibold ${
                priority.isPriority ? "text-white" : "text-ink"
              }`}
            >
              {priority.isPriority
                ? t("prioritySupportHours", { hours: responseHours })
                : t("standardSupportHours", { hours: responseHours })}
            </p>
            <p
              className={`mt-0.5 ${
                priority.isPriority ? "text-white/70" : "text-ink-soft"
              }`}
            >
              {priority.isPriority ? (
                t("includedWithPlan", { plan: priority.planName ?? "" })
              ) : (
                <>
                  {t("priorityUpsell", {
                    hours: FIRST_RESPONSE_HOURS.priority,
                  })}{" "}
                  <Link
                    href="/owner/subscription"
                    className="font-semibold text-brand hover:underline"
                  >
                    {t("seePlans")}
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <NewTicketForm
        isPriority={priority.isPriority}
        responseHours={responseHours}
        planName={priority.planName}
      />

      {tickets.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-10 text-center text-sm text-ink-soft shadow-sm">
          {t("noTicketsYet")}
        </p>
      ) : (
        <ul className="space-y-2">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`/owner/support/${ticket.id}`}
                className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm hover:ring-1 hover:ring-brand/20"
              >
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-ink">
                      {ticket.subject}
                    </p>
                    {ticket.isPriority && (
                      <span className="rounded-full bg-warning-bg px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                        {t("priorityBadge")}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-faint">
                    {ticket.reference} ·{" "}
                    {label("ticketCategory", ticket.category)} ·{" "}
                    {t("messageCount", { count: ticket._count.messages })} ·{" "}
                    {formatDate(ticket.updatedAt, params.locale)}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    ticket.status === "OPEN"
                      ? "bg-brand text-white"
                      : ticket.status === "AWAITING_USER"
                        ? "bg-warning-bg text-warning"
                        : "bg-bone text-ink-soft"
                  }`}
                >
                  {label("ticketStatus", ticket.status)}
                </span>

                <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-line" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
