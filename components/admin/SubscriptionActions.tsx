"use client";

/**
 * SubscriptionActions — Finance confirms or refuses a subscription payment.
 *
 * Confirming is one click because it is the common case and the proof is on
 * screen. Refusing demands a written reason, because the owner is told exactly
 * what it says — "rejected" with no explanation just generates a support
 * ticket, which costs more than typing the reason did.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, Check, X } from "lucide-react";

export default function SubscriptionActions({
  subscriptionId,
  planName,
  canOverride,
}: {
  subscriptionId: string;
  planName: string;
  /** Super Admin only — grants the plan with no payment. */
  canOverride: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "reject" | "override">("idle");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: string, payload: Record<string, string> = {}) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/subscriptions/${subscriptionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "That didn't work.");
        return;
      }
      setMode("idle");
      setReason("");
      router.refresh();
    } catch {
      setError("Network problem. Please retry.");
    } finally {
      setBusy(null);
    }
  }

  if (mode !== "idle") {
    const isReject = mode === "reject";
    return (
      <div className="space-y-1.5">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          autoFocus
          placeholder={
            isReject
              ? "Why can't this be confirmed? The owner sees this."
              : `Why is ${planName} being granted without payment?`
          }
          className="w-full rounded-lg border border-sand-dark px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        <div className="flex items-center gap-1.5">
          <button
            onClick={() =>
              run(isReject ? "REJECT" : "OVERRIDE", {
                [isReject ? "reason" : "note"]: reason.trim(),
              })
            }
            disabled={busy !== null || reason.trim().length < 5}
            className="flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            {isReject ? "Reject" : "Grant"}
          </button>
          <button
            onClick={() => {
              setMode("idle");
              setError(null);
            }}
            className="text-[11px] font-semibold text-ink-soft"
          >
            Cancel
          </button>
        </div>
        {error && (
          <p className="flex items-start gap-1 text-[10px] text-danger">
            <AlertCircle className="mt-px h-2.5 w-2.5 shrink-0" />
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => run("CONFIRM")}
          disabled={busy !== null}
          className="flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
        >
          {busy === "CONFIRM" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          Confirm
        </button>

        <button
          onClick={() => setMode("reject")}
          disabled={busy !== null}
          className="flex items-center gap-1 rounded-lg border border-sand-dark px-2.5 py-1 text-[11px] font-semibold text-ink-soft hover:border-danger-strong hover:text-danger-strong"
        >
          <X className="h-3 w-3" />
          Reject
        </button>

        {canOverride && (
          <button
            onClick={() => setMode("override")}
            disabled={busy !== null}
            className="text-[11px] font-semibold text-warning-dark hover:underline"
          >
            Grant free
          </button>
        )}
      </div>

      {error && (
        <p className="mt-1 flex items-start gap-1 text-[10px] text-danger">
          <AlertCircle className="mt-px h-2.5 w-2.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
