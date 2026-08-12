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

import Link from "next/link";
import { requireAdminModule } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CATEGORY_LABELS, STATUS_LABELS, hoursAgainstTarget } from "@/lib/support";
import { PageHeader, Card, EmptyRow } from "@/components/admin/ui";
import { Zap, AlertTriangle, Clock } from "lucide-react";

export const metadata = { title: "Support — ZuriDrive Admin" };

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
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
    (t) =>
      t.status === "OPEN" &&
      !t.firstRespondedAt &&
      hoursAgainstTarget(t.firstResponseDueAt, null) > 0,
  ).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Support"
        subtitle="Ordered by response deadline — the most at-risk ticket is first."
      />

      {overdue > 0 && !showClosed && (
        <div className="flex items-start gap-2 rounded-2xl bg-danger-bg p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-xs text-danger">
            <strong>
              {overdue} ticket{overdue === 1 ? " is" : "s are"} past the
              first-response target.
            </strong>{" "}
            These are at the top of the list.
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
          Open
        </Link>
        <Link
          href="/admin/support?view=closed"
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            showClosed ? "bg-brand text-white" : "bg-white text-ink-soft"
          }`}
        >
          Resolved &amp; closed
        </Link>
      </div>

      <Card title={showClosed ? "Resolved & closed" : "Waiting"}>
        {tickets.length === 0 ? (
          <EmptyRow>
            {showClosed ? "Nothing resolved yet." : "The queue is empty."}
          </EmptyRow>
        ) : (
          <ul className="divide-y divide-sand">
            {tickets.map((t) => {
              const hours = hoursAgainstTarget(
                t.firstResponseDueAt,
                t.firstRespondedAt,
              );
              const late = !t.firstRespondedAt && hours > 0;

              return (
                <li key={t.id}>
                  <Link
                    href={`/admin/support/${t.id}`}
                    className="flex items-start gap-3 py-3 hover:opacity-80"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {t.isPriority && (
                          <span className="flex items-center gap-0.5 rounded-full bg-warning-bg px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                            <Zap className="h-2.5 w-2.5" />
                            Priority
                          </span>
                        )}
                        <p className="truncate text-sm font-medium text-ink">
                          {t.subject}
                        </p>
                      </div>
                      <p className="mt-0.5 text-[11px] text-ink-faint">
                        {t.reference} · {t.user.name ?? t.user.phone} ·{" "}
                        {CATEGORY_LABELS[t.category]} · {t._count.messages} msg
                        {t.assignedTo?.name ? ` · ${t.assignedTo.name}` : ""}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <span
                        className={`block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          t.status === "OPEN"
                            ? "bg-brand text-white"
                            : "bg-bone text-ink-soft"
                        }`}
                      >
                        {STATUS_LABELS[t.status]}
                      </span>
                      {!showClosed && (
                        <span
                          className={`mt-1 flex items-center justify-end gap-0.5 text-[10px] font-semibold ${
                            late ? "text-danger-strong" : "text-ink-faint"
                          }`}
                        >
                          <Clock className="h-2.5 w-2.5" />
                          {t.firstRespondedAt
                            ? "answered"
                            : late
                              ? `${Math.round(hours)}h late`
                              : `${Math.max(0, Math.round(-hours))}h left`}
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
