"use client";

/**
 * DisputeCancellationFee — client challenges a late-cancellation fee.
 *
 * Proof is optional but the form pushes for it, because a dispute with a
 * photo is far more likely to be decided in the client's favour.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { formatRWF } from "@/lib/currency";
import { Loader2, AlertCircle, Upload, X, Scale, CheckCircle2 } from "lucide-react";

export default function DisputeCancellationFee({
  bookingId,
  feeCharged,
  alreadyDisputed,
}: {
  bookingId: string;
  feeCharged: number;
  alreadyDisputed: boolean;
}) {
  const t = useTranslations("trip");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [proofUrls, setProofUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (alreadyDisputed) {
    return (
      <div className="flex items-start gap-2 rounded-xl bg-bone p-3">
        <Scale className="mt-px h-4 w-4 shrink-0 text-ink-soft" />
        <p className="text-xs text-ink-soft">
          You&apos;ve disputed this fee. Our team will review it and contact you
          — usually within 24 hours.
        </p>
      </div>
    );
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        if (proofUrls.length >= 5) break;
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folder", "bank_proofs");
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? t("disputeUploadFailed"));
          break;
        }
        setProofUrls((u) => [...u, data.url]);
      }
    } catch {
      setError(t("disputeUploadRetry"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/dispute-cancellation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim(), proofUrls }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("disputeSubmitError"));
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

  return (
    <div className="rounded-xl bg-warning-bg p-3">
      <p className="text-sm font-semibold text-warning">
        {t("lateCancelFeeKept", { amount: formatRWF(feeCharged) })}
      </p>
      <p className="mt-0.5 text-xs text-warning">
        {t("lateCancelExplain")}
      </p>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-2 flex items-center gap-1.5 rounded-lg border border-warning-strong px-3 py-1.5 text-xs font-semibold text-warning hover:bg-accent-wash"
        >
          <Scale className="h-3.5 w-3.5" />
          {t("disputeThisFee")}
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            autoFocus
            placeholder={t("disputePlaceholder")}
            className="w-full rounded-lg border border-sand-dark bg-white px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand/20"
          />

          {proofUrls.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {proofUrls.map((u, i) => (
                <span
                  key={u}
                  className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] text-ink-muted"
                >
                  <CheckCircle2 className="h-3 w-3 text-success" />
                  {t("proofN", { n: i + 1 })}
                  <button
                    onClick={() =>
                      setProofUrls((list) => list.filter((x) => x !== u))
                    }
                    aria-label={t("remove")}
                    className="text-ink-faint hover:text-danger-strong"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-warning-strong px-3 py-2 text-xs font-semibold text-warning hover:bg-accent-wash">
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {uploading
              ? tc("uploading")
              : proofUrls.length > 0
                ? t("addMoreProof")
                : t("attachProof")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              multiple
              onChange={upload}
              disabled={uploading || proofUrls.length >= 5}
              className="hidden"
            />
          </label>

          {error && (
            <div className="flex items-start gap-1.5 rounded-lg bg-danger-bg p-2">
              <AlertCircle className="mt-px h-3 w-3 shrink-0 text-danger" />
              <p className="text-[11px] text-danger">{error}</p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={submit}
              disabled={busy || reason.trim().length < 20}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3 w-3 animate-spin" />}
              {busy ? tc("submitting") : t("submitDispute")}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              disabled={busy}
              className="text-xs font-semibold text-warning"
            >
              {tc("cancel")}
            </button>
            <span className="ml-auto text-[10px] text-ink-faint">
              {reason.trim().length < 20
                ? t("charCount20", { count: reason.trim().length })
                : t("readyToSubmit")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
