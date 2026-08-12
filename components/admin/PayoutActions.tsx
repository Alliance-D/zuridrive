"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, Upload, ShieldAlert } from "lucide-react";

/**
 * Payout state transitions.
 *
 * "Mark paid" requires proof of transfer — money has left the account and the
 * ledger needs a receipt, so the upload is not optional.
 */
export default function PayoutActions({
  payoutId,
  status,
  requiresSuperAdmin,
  viewerIsSuperAdmin,
}: {
  payoutId: string;
  status: "PENDING_REQUEST" | "APPROVED" | "PAID" | "FAILED";
  requiresSuperAdmin: boolean;
  viewerIsSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "paid" | "fail">(null);
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payouts/${payoutId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Action failed.");
        return;
      }
      setMode(null);
      router.refresh();
    } catch {
      setError("Network problem. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadProof(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "bank_proofs");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed.");
        return;
      }
      setProofUrl(data.url);
    } catch {
      setError("Upload failed. Please retry.");
    } finally {
      setUploading(false);
    }
  }

  if (status === "PAID" || status === "FAILED") return null;

  // Large payouts are gated on Super Admin, so don't offer a button that
  // the server will only reject.
  const blockedByThreshold =
    status === "PENDING_REQUEST" && requiresSuperAdmin && !viewerIsSuperAdmin;

  if (blockedByThreshold) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-warning-dark">
        <ShieldAlert className="h-3.5 w-3.5" />
        Needs Super Admin approval
      </span>
    );
  }

  if (mode === "paid") {
    return (
      <div className="w-64 space-y-2">
        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-sand-dark px-2 py-2 text-[11px] font-semibold text-ink-muted hover:border-brand">
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Upload className="h-3 w-3" />
          )}
          {proofUrl ? "Proof attached ✓" : uploading ? "Uploading…" : "Attach transfer proof"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={uploadProof}
            className="hidden"
          />
        </label>
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Transfer reference (optional)"
          className="w-full rounded-lg border border-sand-dark px-2 py-1.5 text-xs"
        />
        {error && <p className="text-[11px] text-danger-strong">{error}</p>}
        <div className="flex gap-1.5">
          <button
            onClick={() =>
              send({
                action: "mark_paid",
                proofUrl,
                referenceNumber: reference.trim() || undefined,
              })
            }
            disabled={busy || !proofUrl}
            title={!proofUrl ? "Attach proof of transfer first" : undefined}
            className="flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            Confirm sent
          </button>
          <button
            onClick={() => setMode(null)}
            disabled={busy}
            className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-ink-soft"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (mode === "fail") {
    return (
      <div className="w-64 space-y-2">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What went wrong?"
          autoFocus
          className="w-full rounded-lg border border-sand-dark px-2 py-1.5 text-xs"
        />
        <p className="text-[10px] text-ink-faint">
          The owner is told, and their balance becomes available again.
        </p>
        {error && <p className="text-[11px] text-danger-strong">{error}</p>}
        <div className="flex gap-1.5">
          <button
            onClick={() => send({ action: "fail", reason: reason.trim() })}
            disabled={busy || reason.trim().length < 5}
            className="flex items-center gap-1 rounded-lg bg-danger-strong px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            Mark failed
          </button>
          <button
            onClick={() => setMode(null)}
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
      {status === "PENDING_REQUEST" && (
        <button
          onClick={() => send({ action: "approve" })}
          disabled={busy}
          className="flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Approve
        </button>
      )}
      {status === "APPROVED" && (
        <button
          onClick={() => setMode("paid")}
          className="flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-dark"
        >
          <Check className="h-3 w-3" />
          Mark paid
        </button>
      )}
      <button
        onClick={() => setMode("fail")}
        className="flex items-center gap-1 rounded-lg border border-danger-soft px-2 py-1.5 text-[11px] font-semibold text-danger-strong hover:bg-danger-tint"
      >
        <X className="h-3 w-3" />
        Fail
      </button>
      {error && <span className="text-[11px] text-danger-strong">{error}</span>}
    </div>
  );
}
