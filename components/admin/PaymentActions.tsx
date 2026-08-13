"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, ExternalLink } from "lucide-react";

/**
 * Confirm or void a pending bank transfer.
 *
 * Voiding requires a reason — it's shown to the client, and lands in the
 * admin audit trail.
 */
export default function PaymentActions({
  paymentId,
  proofUrl,
}: {
  paymentId: string;
  proofUrl: string | null;
}) {
  const t = useTranslations("adminActions");
  const tc = useTranslations("common");
  const router = useRouter();
  const [mode, setMode] = useState<null | "void">(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("actionFailed"));
        return;
      }
      setMode(null);
      router.refresh();
    } catch {
      setError(tc("networkRetry"));
    } finally {
      setBusy(false);
    }
  }

  if (mode === "void") {
    return (
      <div className="space-y-2">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("whyRejected")}
          autoFocus
          className="w-full rounded-lg border border-sand-dark px-2 py-1.5 text-xs"
        />
        {error && <p className="text-[11px] text-danger-strong">{error}</p>}
        <div className="flex gap-1.5">
          <button
            onClick={() => send({ action: "void", reason: reason.trim() })}
            disabled={busy || reason.trim().length < 5}
            className="flex items-center gap-1 rounded-lg bg-danger-strong px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            Confirm rejection
          </button>
          <button
            onClick={() => {
              setMode(null);
              setError(null);
            }}
            disabled={busy}
            className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-ink-soft"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {proofUrl && (
        <a
          href={proofUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded-lg border border-sand-dark px-2 py-1.5 text-[11px] font-semibold text-ink-muted hover:border-brand"
        >
          Proof
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      )}
      <button
        onClick={() => send({ action: "confirm" })}
        disabled={busy}
        className="flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        Confirm
      </button>
      <button
        onClick={() => setMode("void")}
        disabled={busy}
        className="flex items-center gap-1 rounded-lg border border-danger-soft px-2 py-1.5 text-[11px] font-semibold text-danger-strong hover:bg-danger-tint"
      >
        <X className="h-3 w-3" />
        Reject
      </button>
      {error && <span className="text-[11px] text-danger-strong">{error}</span>}
    </div>
  );
}
