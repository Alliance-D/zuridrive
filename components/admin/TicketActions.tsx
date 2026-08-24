"use client";

/**
 * TicketActions — support agent controls on a ticket.
 *
 * Resolving does not stop the response clock; only a reply does. The button
 * copy avoids implying otherwise.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Loader2, AlertCircle } from "lucide-react";

type Action = "ASSIGN_TO_ME" | "RESOLVE" | "CLOSE" | "REOPEN";

export default function TicketActions({
  ticketId,
  status,
  isAssignedToMe,
}: {
  ticketId: string;
  status: string;
  isAssignedToMe: boolean;
}) {
  const t = useTranslations("adminActions");
  const tc = useTranslations("common");
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: Action) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/support/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("didntWork"));
        return;
      }
      router.refresh();
    } catch {
      setError(tc("networkRetry"));
    } finally {
      setBusy(null);
    }
  }

  const closed = status === "CLOSED";

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {!isAssignedToMe && !closed && (
          <Button onClick={() => run("ASSIGN_TO_ME")} busy={busy === "ASSIGN_TO_ME"}>
            {t("assignToMe")}
          </Button>
        )}

        {status !== "RESOLVED" && !closed && (
          <Button onClick={() => run("RESOLVE")} busy={busy === "RESOLVE"}>
            {t("markResolved")}
          </Button>
        )}

        {closed ? (
          <Button onClick={() => run("REOPEN")} busy={busy === "REOPEN"}>
            {t("reopen")}
          </Button>
        ) : (
          <Button onClick={() => run("CLOSE")} busy={busy === "CLOSE"} subtle>
            {t("close")}
          </Button>
        )}
      </div>

      {error && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-danger-bg p-2">
          <AlertCircle className="mt-px h-3 w-3 shrink-0 text-danger" />
          <p className="text-[11px] text-danger">{error}</p>
        </div>
      )}
    </div>
  );
}

function Button({
  onClick,
  busy,
  subtle = false,
  children,
}: {
  onClick: () => void;
  busy: boolean;
  subtle?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${
        subtle
          ? "border border-sand-dark text-ink-soft hover:border-brand hover:text-brand"
          : "bg-brand text-white hover:bg-brand-dark"
      }`}
    >
      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
      {children}
    </button>
  );
}
