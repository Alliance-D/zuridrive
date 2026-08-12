/**
 * /owner/support/[id] — one ticket, from the owner's side.
 *
 * The ownership check is a query filter rather than a post-fetch comparison,
 * so a ticket belonging to someone else is a 404 and not a 403 — a 403 would
 * confirm the ticket exists.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/support";
import TicketThread from "@/components/support/TicketThread";
import ReplyBox from "@/components/support/ReplyBox";
import { ArrowLeft, Zap, CheckCircle2 } from "lucide-react";

export const metadata = { title: "Support ticket — ZuriDrive" };

export default async function OwnerTicketPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect(`/login?next=/owner/support/${params.id}`);

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true } } },
      },
      booking: { select: { id: true, reference: true } },
    },
  });

  if (!ticket) notFound();

  return (
    <div className="space-y-4">
      <Link
        href="/owner/support"
        className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-brand"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All tickets
      </Link>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-ink">
              {ticket.subject}
            </h1>
            <p className="mt-0.5 text-[11px] text-ink-faint">
              {ticket.reference} · {CATEGORY_LABELS[ticket.category]} · opened{" "}
              {ticket.createdAt.toLocaleDateString("en-RW")}
              {ticket.booking && (
                <>
                  {" "}
                  ·{" "}
                  <Link
                    href={`/owner/bookings/${ticket.booking.id}`}
                    className="font-semibold text-brand hover:underline"
                  >
                    {ticket.booking.reference}
                  </Link>
                </>
              )}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {ticket.isPriority && (
              <span className="flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-[10px] font-semibold text-warning">
                <Zap className="h-3 w-3" />
                Priority
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                ticket.status === "OPEN"
                  ? "bg-brand text-white"
                  : ticket.status === "AWAITING_USER"
                    ? "bg-warning-bg text-warning"
                    : "bg-bone text-ink-soft"
              }`}
            >
              {STATUS_LABELS[ticket.status]}
            </span>
          </div>
        </div>

        {ticket.status === "OPEN" && !ticket.firstRespondedAt && (
          <p className="mt-2 text-xs text-ink-soft">
            We aim to reply by{" "}
            {ticket.firstResponseDueAt.toLocaleString("en-RW")}.
          </p>
        )}

        {ticket.status === "RESOLVED" && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Marked resolved. Reply below if it isn&apos;t sorted — that reopens
            it with the history intact.
          </p>
        )}
      </div>

      <TicketThread messages={ticket.messages} />

      {ticket.status === "CLOSED" ? (
        <p className="rounded-2xl bg-bone px-4 py-6 text-center text-sm text-ink-soft">
          This ticket is closed. Open a new one if you need us again.
        </p>
      ) : (
        <ReplyBox ticketId={ticket.id} placeholder="Add to this ticket…" />
      )}
    </div>
  );
}
