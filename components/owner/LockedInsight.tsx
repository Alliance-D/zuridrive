/**
 * LockedInsight — a section the owner's plan doesn't reach yet.
 *
 * It names what the section actually contains rather than saying "upgrade to
 * unlock". An owner deciding whether to pay more needs to know what they'd be
 * buying; a blurred rectangle tells them nothing.
 *
 * Deliberately not a fake chart behind a blur — showing invented data, even
 * decoratively, teaches people not to trust the real charts.
 */

import { Link } from "@/i18n/navigation";
import { Lock, ArrowRight } from "lucide-react";

export default function LockedInsight({
  title,
  what,
  planName,
}: {
  title: string;
  /** The concrete questions this section answers. */
  what: string[];
  /** The plan that would unlock it, when there is one. */
  planName: string | null;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-sand-dark bg-white p-4">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bone">
          <Lock className="h-3.5 w-3.5 text-ink-faint" />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            {planName
              ? `Included with ${planName}.`
              : "Not available on your current plan."}
          </p>

          <ul className="mt-2.5 space-y-1">
            {what.map((line) => (
              <li key={line} className="flex items-start gap-1.5 text-xs text-ink-muted">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                {line}
              </li>
            ))}
          </ul>

          <Link
            href="/owner/subscription"
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
          >
            {planName ? `See ${planName}` : "See plans"}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </section>
  );
}
