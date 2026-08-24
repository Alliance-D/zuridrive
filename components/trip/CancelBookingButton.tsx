"use client";

/**
 * CancelBookingButton — client or owner cancels a booking.
 *
 * States what happens to the money before asking for confirmation, so nobody
 * cancels a paid booking without knowing what comes back.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { formatMoney } from "@/lib/currency";
import { Loader2, AlertCircle, XCircle } from "lucide-react";

export default function CancelBookingButton({
  bookingId,
  /** Deposit that would be returned. 0 when nothing was collected. */
  refundableDeposit,
  viewerRole,
}: {
  bookingId: string;
  refundableDeposit: number;
  viewerRole: "CLIENT" | "OWNER";
}) {
  const t = useTranslations("trip");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("cancelError"));
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError(tc("networkRetry"));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-danger-soft px-3 py-2 text-xs font-semibold text-danger-strong hover:bg-danger-tint"
      >
        <XCircle className="h-3.5 w-3.5" />
        {t("cancelBooking")}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-danger-soft bg-danger-tint p-3">
      <p className="text-sm font-semibold text-danger">
        {t("cancelThisBooking")}
      </p>
      <p className="mt-0.5 text-xs text-danger">
        {refundableDeposit > 0
          ? t("cancelRefundLine", { amount: formatMoney(refundableDeposit) })
          : t("cancelNoRefund")}{" "}
        {viewerRole === "OWNER"
          ? t("clientWillBeTold")
          : t("ownerWillBeTold")}{" "}
        {t("cantBeUndone")}
      </p>

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        autoFocus
        placeholder={
          viewerRole === "OWNER" ? t("whyCantTake") : t("whyCancelling")
        }
        className="mt-2 w-full rounded-lg border border-danger-soft bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-danger-strong/20"
      />

      {error && (
        <div className="mt-2 flex items-start gap-1.5">
          <AlertCircle className="mt-px h-3 w-3 shrink-0 text-danger" />
          <p className="text-[11px] text-danger">{error}</p>
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <button
          onClick={submit}
          disabled={busy || reason.trim().length < 5}
          className="flex items-center gap-1.5 rounded-lg bg-danger-strong px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          {busy ? t("cancelling") : t("yesCancelIt")}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={busy}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-soft"
        >
          {t("keepBooking")}
        </button>
      </div>
    </div>
  );
}
