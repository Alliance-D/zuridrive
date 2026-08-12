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

import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  resolvePriority,
  FIRST_RESPONSE_HOURS,
  CATEGORY_LABELS,
  STATUS_LABELS,
} from "@/lib/support";
import NewTicketForm from "@/components/support/NewTicketForm";
import { Zap, MessageSquare, ArrowRight } from "lucide-react";

export const metadata = { title: "Support — ZuriDrive" };

export default async function OwnerSupportPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login?next=/owner/support");

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
        <h1 className="text-xl font-bold text-ink">Support</h1>
        <p className="text-xs text-ink-soft">
          Talk to a human about your fleet, payouts or account.
        </p>
      </div>

      {/* The promise, stated in hours */}
      <div
        className={`rounded-2xl p-4 ${
          priority.isPriority
            ? "bg-brand text-white"
            : "bg-white shadow-sm"
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
                ? `Priority support — we reply within ${responseHours} hours`
                : `We reply within ${responseHours} hours`}
            </p>
            <p
              className={`mt-0.5 ${
                priority.isPriority ? "text-white/70" : "text-ink-soft"
              }`}
            >
              {priority.isPriority ? (
                <>
                  Included with {priority.planName}. Your tickets are answered
                  ahead of the standard queue.
                </>
              ) : (
                <>
                  Priority support cuts this to {FIRST_RESPONSE_HOURS.priority}{" "}
                  hours and moves your tickets nearer the front of the queue.{" "}
                  <Link
                    href="/owner/subscription"
                    className="font-semibold text-brand hover:underline"
                  >
                    See plans
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
          You haven&apos;t asked us anything yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link
                href={`/owner/support/${t.id}`}
                className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm hover:ring-1 hover:ring-brand/20"
              >
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-ink">
                      {t.subject}
                    </p>
                    {t.isPriority && (
                      <span className="rounded-full bg-warning-bg px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                        Priority
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-faint">
                    {t.reference} · {CATEGORY_LABELS[t.category]} ·{" "}
                    {t._count.messages} message
                    {t._count.messages === 1 ? "" : "s"} ·{" "}
                    {t.updatedAt.toLocaleDateString("en-RW")}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    t.status === "OPEN"
                      ? "bg-brand text-white"
                      : t.status === "AWAITING_USER"
                        ? "bg-warning-bg text-warning"
                        : "bg-bone text-ink-soft"
                  }`}
                >
                  {STATUS_LABELS[t.status]}
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
