"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Loader2, AlertCircle, Ban, CheckCircle2 } from "lucide-react";

/**
 * Admin intervention on a booking. Both actions require a written reason —
 * they override what the client and owner agreed, so the record matters.
 */
export default function InterveneActions({
  bookingId,
  canCancel,
  canForceComplete,
}: {
  bookingId: string;
  canCancel: boolean;
  canForceComplete: boolean;
}) {
  const t = useTranslations("adminActions");
  const tc = useTranslations("common");
  const router = useRouter();
  const [mode, setMode] = useState<null | "cancel" | "force_complete">(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!mode || reason.trim().length < 10) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/intervene`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: mode, reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("actionFailed"));
        return;
      }
      setMode(null);
      setReason("");
      router.refresh();
    } catch {
      setError(tc("networkRetry"));
    } finally {
      setBusy(false);
    }
  }

  if (!canCancel && !canForceComplete) {
    return (
      <p className="text-xs text-ink-faint">
        {t("nothingToIntervene")}
      </p>
    );
  }

  if (mode) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-muted">
          {mode === "cancel"
            ? t("whyCancelling")
            : t("whyForceCompleting")}
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          autoFocus
          placeholder={t("bothPartiesSee")}
          className="w-full rounded-lg border border-sand-dark px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        {mode === "cancel" && (
          <p className="text-[11px] text-warning-dark">
            Cancelling voids the payment and returns any collected deposit to the
            client.
          </p>
        )}
        {error && (
          <div className="flex items-start gap-1.5 rounded-lg bg-danger-bg p-2">
            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-danger" />
            <p className="text-xs text-danger">{error}</p>
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={submit}
            disabled={busy || reason.trim().length < 10}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 ${
              mode === "cancel"
                ? "bg-danger-strong hover:bg-danger"
                : "bg-brand hover:bg-brand-dark"
            }`}
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            {mode === "cancel" ? t("cancelBooking") : t("forceComplete")}
          </button>
          <button
            onClick={() => {
              setMode(null);
              setError(null);
            }}
            disabled={busy}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-ink-soft"
          >
            {t("back")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canForceComplete && (
        <button
          onClick={() => setMode("force_complete")}
          className="flex items-center gap-1.5 rounded-lg border border-sand-dark px-3 py-2 text-xs font-semibold text-ink-muted hover:border-brand hover:text-brand"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {t("forceComplete")}
        </button>
      )}
      {canCancel && (
        <button
          onClick={() => setMode("cancel")}
          className="flex items-center gap-1.5 rounded-lg border border-danger-soft px-3 py-2 text-xs font-semibold text-danger-strong hover:bg-danger-tint"
        >
          <Ban className="h-3.5 w-3.5" />
          {t("cancelBooking")}
        </button>
      )}
    </div>
  );
}
