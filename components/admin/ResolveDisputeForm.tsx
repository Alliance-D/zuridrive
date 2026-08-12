"use client";

/**
 * ResolveDisputeForm — decide a dispute and move the deposit.
 *
 * The split is shown live and the submit button stays disabled until the
 * allocation is exact. The server re-checks the same rule, but the operator
 * shouldn't be able to reach a state where the numbers don't add up.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatRWF } from "@/lib/currency";
import {
  Loader2,
  AlertCircle,
  UserCheck,
  Building2,
  SplitSquareHorizontal,
  XCircle,
} from "lucide-react";

type Outcome =
  | "RESOLVED_FOR_CLIENT"
  | "RESOLVED_FOR_OWNER"
  | "SPLIT"
  | "DISMISSED";

const OPTIONS: {
  id: Outcome;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  {
    id: "RESOLVED_FOR_CLIENT",
    label: "For the client",
    description: "Full deposit returned to the client.",
    icon: UserCheck,
  },
  {
    id: "RESOLVED_FOR_OWNER",
    label: "For the owner",
    description: "Full deposit awarded to the owner.",
    icon: Building2,
  },
  {
    id: "SPLIT",
    label: "Split it",
    description: "Divide the deposit between both parties.",
    icon: SplitSquareHorizontal,
  },
  {
    id: "DISMISSED",
    label: "Dismiss",
    description: "No valid claim — deposit returned to the client.",
    icon: XCircle,
  },
];

export default function ResolveDisputeForm({
  disputeId,
  depositAmount,
  depositCollected,
}: {
  disputeId: string;
  depositAmount: number;
  /** False when the deposit was never actually paid. */
  depositCollected: boolean;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [notes, setNotes] = useState("");
  const [clientAmount, setClientAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientRefund = Number(clientAmount || 0);
  const ownerAward = depositAmount - clientRefund;
  const splitValid =
    outcome !== "SPLIT" ||
    (clientRefund >= 0 && clientRefund <= depositAmount && clientAmount !== "");

  const canSubmit =
    outcome !== null && notes.trim().length >= 10 && splitValid && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/disputes/${disputeId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome,
          notes: notes.trim(),
          ...(outcome === "SPLIT"
            ? { clientRefundAmount: clientRefund, ownerAwardAmount: ownerAward }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not resolve this dispute.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network problem. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  if (!depositCollected && depositAmount > 0) {
    return (
      <div className="flex items-start gap-2 rounded-xl bg-warning-tint p-3">
        <AlertCircle className="mt-px h-4 w-4 shrink-0 text-warning-dark" />
        <p className="text-xs text-warning-dark">
          The deposit on this booking was never collected, so there is nothing
          to award. Resolve the payment before resolving the dispute.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-medium text-ink-muted">Outcome</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {OPTIONS.map((o) => {
            const Icon = o.icon;
            const selected = outcome === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setOutcome(o.id)}
                className={`flex items-start gap-2 rounded-xl border-2 p-3 text-left transition-colors ${
                  selected
                    ? "border-brand bg-brand/5"
                    : "border-sand-dark hover:border-ink-faint"
                }`}
              >
                <Icon
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    selected ? "text-brand" : "text-ink-faint"
                  }`}
                />
                <span className="min-w-0">
                  <span
                    className={`block text-sm font-semibold ${
                      selected ? "text-brand" : "text-ink"
                    }`}
                  >
                    {o.label}
                  </span>
                  <span className="block text-[11px] text-ink-soft">
                    {o.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Split allocation */}
      {outcome === "SPLIT" && depositAmount > 0 && (
        <div className="rounded-xl bg-bone p-3">
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            Amount returned to the client
          </label>
          <div className="relative max-w-xs">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint">
              RWF
            </span>
            <input
              value={clientAmount}
              onChange={(e) =>
                setClientAmount(e.target.value.replace(/[^\d]/g, ""))
              }
              inputMode="numeric"
              placeholder="0"
              className="w-full rounded-lg border border-sand-dark bg-white py-2 pl-11 pr-3 text-sm"
            />
          </div>

          <div className="mt-3 space-y-1 border-t border-sand-dark pt-2 text-xs">
            <div className="flex justify-between">
              <span className="text-ink-soft">To client</span>
              <span className="font-semibold text-ink">
                {formatRWF(Math.max(0, Math.min(clientRefund, depositAmount)))}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-soft">To owner</span>
              <span className="font-semibold text-ink">
                {formatRWF(Math.max(0, ownerAward))}
              </span>
            </div>
            <div className="flex justify-between border-t border-sand-dark pt-1">
              <span className="font-semibold text-ink">Deposit total</span>
              <span className="font-bold text-brand">
                {formatRWF(depositAmount)}
              </span>
            </div>
          </div>

          {clientRefund > depositAmount && (
            <p className="mt-2 text-xs text-danger-strong">
              That&apos;s more than the deposit. Maximum is{" "}
              {formatRWF(depositAmount)}.
            </p>
          )}
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-muted">
          Your decision and reasoning
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Explain what the evidence shows and why you reached this outcome. Both parties will see this."
          className="w-full rounded-lg border border-sand-dark px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        <p className="mt-1 text-[11px] text-ink-faint">
          {notes.trim().length < 10
            ? `At least 10 characters (${notes.trim().length}/10).`
            : "Shown to both the client and the owner, and kept in the audit log."}
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-danger-bg p-3">
          <AlertCircle className="mt-px h-4 w-4 shrink-0 text-danger" />
          <p className="text-xs text-danger">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? "Resolving…" : "Resolve dispute"}
        </button>
        <p className="text-[11px] text-ink-faint">
          This moves the deposit and can&apos;t be undone.
        </p>
      </div>
    </div>
  );
}
