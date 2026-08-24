/**
 * /admin/support — the support queue.
 *
 * The ordering is the whole point of hasPrioritySupport, so it is worth being
 * explicit about what it does:
 *
 *   Tickets are sorted by first-response DEADLINE, soonest first. Priority
 *   tickets get a 4-hour deadline instead of 24, which is what pulls them
 *   forward — but a standard ticket that has been waiting 23 hours still
 *   outranks a priority ticket raised five minutes ago.
 *
 * That is deliberate. Sorting by tier would let a steady trickle of priority
 * tickets starve a standard one indefinitely, which is how a support promise
 * to paying owners quietly becomes a broken promise to everyone else.
 */

import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { requireAdminModule } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hoursAgainstTarget } from "@/lib/support";
import { getEnumLabeller } from "@/lib/enum-labels";
import { PageHeader, Card, EmptyRow } from "@/components/admin/ui";
import { Zap, AlertTriangle, Clock } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  return { title: `${t("support")} — ZuriDrive Admin` };
}

export default async function AdminSupportPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { view?: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  const label = await getEnumLabeller(params.locale);
  await requireAdminModule("SUPPORT_AGENT");

  const showClosed = searchParams.view === "closed";

  const tickets = await prisma.supportTicket.findMany({
    where: showClosed
      ? { status: { in: ["RESOLVED", "CLOSED"] } }
      : { status: { in: ["OPEN", "AWAITING_USER"] } },
    orderBy: showClosed
      ? { updatedAt: "desc" }
      : // Soonest deadline first — see the header note.
        { firstResponseDueAt: "asc" },
    include: {
      user: { select: { name: true, phone: true } },
      assignedTo: { select: { name: true } },
      _count: { select: { messages: true } },
    },
    take: 100,
  });

  const overdue = tickets.filter(
    (ticket) =>
      ticket.status === "OPEN" &&
      !ticket.firstRespondedAt &&
      hoursAgainstTarget(ticket.firstResponseDueAt, null) > 0,
  ).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("support")}
        subtitle={t("supportSub")}
      />

      {overdue > 0 && !showClosed && (
        <div className="flex items-start gap-2 rounded-2xl bg-danger-bg p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-xs text-danger">
            <strong>{t("overdueTickets", { count: overdue })}</strong>{" "}
            {t("overdueNote")}
          </p>
        </div>
      )}

      <div className="flex gap-1.5">
        <Link
          href="/admin/support"
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            !showClosed ? "bg-brand text-white" : "bg-white text-ink-soft"
          }`}
        >
          {t("open")}
        </Link>
        <Link
          href="/admin/support?view=closed"
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            showClosed ? "bg-brand text-white" : "bg-white text-ink-soft"
          }`}
        >
          {t("resolvedAndClosed")}
        </Link>
      </div>

      <Card title={showClosed ? t("resolvedAndClosed") : t("waiting")}>
        {tickets.length === 0 ? (
          <EmptyRow>
            {showClosed ? t("nothingResolved") : t("queueEmpty")}
          </EmptyRow>
        ) : (
          <ul className="divide-y divide-sand">
            {tickets.map((ticket) => {
              const hours = hoursAgainstTarget(
                ticket.firstResponseDueAt,
                ticket.firstRespondedAt,
              );
              const late = !ticket.firstRespondedAt && hours > 0;

              return (
                <li key={ticket.id}>
                  <Link
                    href={`/admin/support/${ticket.id}`}
                    className="flex items-start gap-3 py-3 hover:opacity-80"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {ticket.isPriority && (
                          <span className="flex items-center gap-0.5 rounded-full bg-warning-bg px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                            <Zap className="h-2.5 w-2.5" />
                            {t("priority")}
                          </span>
                        )}
                        <p className="truncate text-sm font-medium text-ink">
                          {ticket.subject}
                        </p>
                      </div>
                      <p className="mt-0.5 text-[11px] text-ink-faint">
                        {ticket.reference} ·{" "}
                        {ticket.user.name ?? ticket.user.phone} ·{" "}
                        {label("ticketCategory", ticket.category)} ·{" "}
                        {t("msgCount", { count: ticket._count.messages })}
                        {ticket.assignedTo?.name
                          ? ` · ${ticket.assignedTo.name}`
                          : ""}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <span
                        className={`block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          ticket.status === "OPEN"
                            ? "bg-brand text-white"
                            : "bg-bone text-ink-soft"
                        }`}
                      >
                        {label("ticketStatus", ticket.status)}
                      </span>
                      {!showClosed && (
                        <span
                          className={`mt-1 flex items-center justify-end gap-0.5 text-[10px] font-semibold ${
                            late ? "text-danger-strong" : "text-ink-faint"
                          }`}
                        >
                          <Clock className="h-2.5 w-2.5" />
                          {ticket.firstRespondedAt
                            ? t("answered")
                            : late
                              ? t("hoursLate", { count: Math.round(hours) })
                              : t("hoursLeft", {
                                  count: Math.max(0, Math.round(-hours)),
                                })}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
