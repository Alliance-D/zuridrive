/**
 * /admin/support/[id] — one ticket, from the support agent's side.
 *
 * The header shows why this ticket is where it is in the queue: its deadline,
 * whether it was met, and which plan (if any) set the target. An agent who can
 * see that a ticket is two hours from missing its target can act on it.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions, requireAdminModule } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hoursAgainstTarget } from "@/lib/support";
import { PageHeader } from "@/components/admin/ui";
import { getTranslations } from "next-intl/server";
import { formatDateTime } from "@/lib/dates";
import { getEnumLabeller } from "@/lib/enum-labels";
import TicketThread from "@/components/support/TicketThread";
import ReplyBox from "@/components/support/ReplyBox";
import TicketActions from "@/components/admin/TicketActions";
import { ArrowLeft, Zap, Clock, CheckCircle2 } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  return { title: `${t("supportTicketAdmin")} — ZuriDrive Admin` };
}

export default async function AdminTicketPage({
  params,
}: {
  params: { id: string; locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  const label = await getEnumLabeller(params.locale);
  await requireAdminModule("SUPPORT_AGENT");
  const session = await getServerSession(authOptions);

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { id: true, name: true, phone: true, email: true } },
      assignedTo: { select: { id: true, name: true } },
      booking: { select: { id: true, reference: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true } } },
      },
    },
  });

  if (!ticket) notFound();

  const hours = hoursAgainstTarget(
    ticket.firstResponseDueAt,
    ticket.firstRespondedAt,
  );
  const late = hours > 0;

  return (
    <div className="space-y-4">
      <Link
        href="/admin/support"
        className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-brand"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("queue")}
      </Link>

      <PageHeader
        title={ticket.subject}
        subtitle={t("ticketSubtitle", {
          reference: ticket.reference,
          category: label("ticketCategory", ticket.category),
        })}
      />

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {ticket.isPriority && (
            <span className="flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-[10px] font-semibold text-warning">
              <Zap className="h-3 w-3" />
              {ticket.priorityPlanName
                ? t("priorityWithPlan", { plan: ticket.priorityPlanName })
                : t("priority")}
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              ticket.status === "OPEN"
                ? "bg-brand text-white"
                : "bg-bone text-ink-soft"
            }`}
          >
            {label("ticketStatus", ticket.status)}
          </span>
        </div>

        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-ink-faint">{t("from")}</dt>
            <dd className="font-medium text-ink">
              {ticket.user.name ?? t("unnamed")} · {ticket.user.phone}
              {ticket.user.email ? ` · ${ticket.user.email}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-ink-faint">{t("firstResponse")}</dt>
            <dd
              className={`flex items-center gap-1 font-medium ${
                ticket.firstRespondedAt
                  ? late
                    ? "text-warning-strong"
                    : "text-success"
                  : late
                    ? "text-danger-strong"
                    : "text-ink"
              }`}
            >
              {ticket.firstRespondedAt ? (
                <>
                  <CheckCircle2 className="h-3 w-3" />
                  {late
                    ? t("answeredLate", { count: Math.round(hours) })
                    : t("answeredEarly", {
                        count: Math.max(0, Math.round(-hours)),
                      })}
                </>
              ) : (
                <>
                  <Clock className="h-3 w-3" />
                  {late
                    ? t("pastTarget", { count: Math.round(hours) })
                    : t("dueBy", {
                        date: formatDateTime(
                          ticket.firstResponseDueAt,
                          params.locale,
                        ),
                      })}
                </>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-ink-faint">{t("assignedTo")}</dt>
            <dd className="font-medium text-ink">
              {ticket.assignedTo?.name ?? t("nobodyYet")}
            </dd>
          </div>
          {ticket.booking && (
            <div>
              <dt className="text-ink-faint">{t("booking")}</dt>
              <dd>
                <Link
                  href={`/admin/bookings/${ticket.booking.id}`}
                  className="font-semibold text-brand hover:underline"
                >
                  {ticket.booking.reference}
                </Link>
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-3 border-t border-sand pt-3">
          <TicketActions
            ticketId={ticket.id}
            status={ticket.status}
            isAssignedToMe={ticket.assignedToId === session?.user?.id}
          />
        </div>
      </div>

      <TicketThread messages={ticket.messages} />

      {ticket.status === "CLOSED" ? (
        <p className="rounded-2xl bg-bone px-4 py-6 text-center text-sm text-ink-soft">
          {t("closedReopen")}
        </p>
      ) : (
        <ReplyBox
          ticketId={ticket.id}
          placeholder={t("replyToOwner")}
          submitLabel={t("sendAsSupport")}
        />
      )}
    </div>
  );
}
