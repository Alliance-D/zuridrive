"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatRWF } from "@/lib/currency";
import { Banknote, Loader2, AlertCircle, Smartphone, Landmark } from "lucide-react";

interface Props {
  available: number;
  hasMomo: boolean;
  hasBank: boolean;
  /** Blocks the request when one is already in flight. */
  hasOpenRequest: boolean;
}

export default function RequestPayoutButton({
  available,
  hasMomo,
  hasBank,
  hasOpenRequest,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"MTN_MOMO" | "BANK_TRANSFER">(
    hasMomo ? "MTN_MOMO" : "BANK_TRANSFER",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRequest = available > 0 && !hasOpenRequest && (hasMomo || hasBank);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/owner/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError("Network problem. Please check your connection and retry.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!canRequest) {
    return (
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm text-ink-soft">
          {hasOpenRequest
            ? "You have a payout in progress. We’ll text you once it’s been sent."
            : available === 0
              ? "No earnings available to withdraw yet."
              : "Add a MoMo number or bank account in your profile to request a payout."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      {!open ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">
              {formatRWF(available)} ready to withdraw
            </p>
            <p className="text-xs text-ink-soft">
              Paid out within 1–3 business days of approval.
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            <Banknote className="h-4 w-4" />
            Request payout
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-ink">
              Withdraw {formatRWF(available)}
            </p>
            <p className="text-xs text-ink-soft">
              This covers every completed trip not yet paid out.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {hasMomo && (
              <MethodButton
                icon={Smartphone}
                label="MTN MoMo"
                selected={method === "MTN_MOMO"}
                onClick={() => setMethod("MTN_MOMO")}
              />
            )}
            {hasBank && (
              <MethodButton
                icon={Landmark}
                label="Bank transfer"
                selected={method === "BANK_TRANSFER"}
                onClick={() => setMethod("BANK_TRANSFER")}
              />
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-danger-bg p-2.5">
              <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-danger" />
              <p className="text-xs text-danger">{error}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="flex-1 rounded-lg border border-sand-dark px-3 py-2 text-sm font-semibold text-ink-muted hover:border-brand"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={submitting}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Submitting…" : "Confirm request"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MethodButton({
  icon: Icon,
  label,
  selected,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl border-2 p-3 text-left transition-colors ${
        selected
          ? "border-brand bg-brand/5"
          : "border-sand-dark hover:border-ink-faint"
      }`}
    >
      <Icon
        className={`h-4 w-4 shrink-0 ${selected ? "text-brand" : "text-ink-faint"}`}
      />
      <span
        className={`text-sm font-semibold ${selected ? "text-brand" : "text-ink-muted"}`}
      >
        {label}
      </span>
    </button>
  );
}
