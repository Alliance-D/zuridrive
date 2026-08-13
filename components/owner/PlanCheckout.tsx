"use client";

/**
 * PlanCheckout — an owner buys or renews a plan.
 *
 * Mirrors the booking payment flow: MoMo pushes a prompt and we poll, bank
 * transfer takes proof and waits for Finance. Nothing is promised until money
 * is verified, so the copy never says "activated" on submission alone.
 *
 * The renewal case is called out explicitly, because an owner renewing early
 * needs to know they aren't losing the days they've already paid for.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatRWF } from "@/lib/currency";
import {
  Loader2,
  AlertCircle,
  Upload,
  CheckCircle2,
  Smartphone,
  Building2,
} from "lucide-react";

type Method = "MTN_MOMO" | "BANK_TRANSFER";

export default function PlanCheckout({
  planId,
  planName,
  priceMonthly,
  isCurrent,
  hasActivePlan,
  defaultMomoNumber,
}: {
  planId: string;
  planName: string;
  priceMonthly: number;
  isCurrent: boolean;
  hasActivePlan: boolean;
  defaultMomoNumber: string | null;
}) {
  const t = useTranslations("plan");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<Method>("MTN_MOMO");
  const [phone, setPhone] = useState(defaultMomoNumber ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  async function payWithMoMo() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/owner/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "initiate_momo",
          planId,
          phoneNumber: phone.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("startError"));
        return;
      }
      setNotice(data.message);
      await pollUntilResolved(data.subscriptionId);
    } catch {
      setError(tc("networkRetry"));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Poll for the MoMo result. Gives up after ~2 minutes and says so rather
   * than spinning forever — an unanswered USSD prompt is a normal outcome.
   */
  async function pollUntilResolved(subscriptionId: string) {
    setPolling(true);
    try {
      for (let attempt = 0; attempt < 24; attempt++) {
        await new Promise((r) => setTimeout(r, 5000));

        const res = await fetch("/api/owner/subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "confirm_momo", subscriptionId }),
        });
        const data = await res.json();

        if (data.status === "CONFIRMED") {
          setNotice(
            data.relisted > 0
              ? `${planName} is active — ${data.relisted} of your cars are back online.`
              : `${planName} is active.`,
          );
          router.refresh();
          return;
        }
        if (data.status === "FAILED") {
          setError(data.error ?? t("notApproved"));
          setNotice(null);
          return;
        }
      }
      setNotice(
        t("notSeenYet"),
      );
    } finally {
      setPolling(false);
    }
  }

  async function payByTransfer(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "bank_proofs");
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      const upData = await up.json();
      if (!up.ok) {
        setError(upData.error ?? t("uploadFailed"));
        return;
      }

      const res = await fetch("/api/owner/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bank_transfer",
          planId,
          proofUrl: upData.url,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("submitError"));
        return;
      }
      setNotice(data.message);
      router.refresh();
    } catch {
      setError(tc("networkRetry"));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`mt-4 w-full rounded-lg px-3 py-2 text-xs font-semibold ${
          isCurrent
            ? "border border-brand text-brand hover:bg-brand-wash"
            : "bg-brand text-white hover:bg-brand-dark"
        }`}
      >
        {isCurrent
          ? t("renewEarly")
          : hasActivePlan
            ? t("switchToThis")
            : t("choose")}
      </button>
    );
  }

  return (
    <div className="mt-4 space-y-2 border-t border-sand pt-3">
      <p className="text-xs font-semibold text-ink">
        {t("forThirtyDays", { amount: formatRWF(priceMonthly) })}
      </p>

      {hasActivePlan && (
        <p className="text-[11px] text-ink-soft">
          {isCurrent
            ? t("renewNote")
            : t("switchNote")}
        </p>
      )}

      <div className="flex gap-1.5">
        <MethodTab
          active={method === "MTN_MOMO"}
          onClick={() => setMethod("MTN_MOMO")}
          icon={<Smartphone className="h-3 w-3" />}
          label={t("momo")}
        />
        <MethodTab
          active={method === "BANK_TRANSFER"}
          onClick={() => setMethod("BANK_TRANSFER")}
          icon={<Building2 className="h-3 w-3" />}
          label={t("bankTransfer")}
        />
      </div>

      {method === "MTN_MOMO" ? (
        <div className="space-y-1.5">
          <label htmlFor={`momo-${planId}`} className="sr-only">
            {t("momo")}
          </label>
          <input
            id={`momo-${planId}`}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t("momoPlaceholder")}
            inputMode="tel"
            className="w-full rounded-lg border border-sand-dark px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          <button
            onClick={payWithMoMo}
            disabled={busy || polling || phone.trim().length < 10}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {(busy || polling) && <Loader2 className="h-3 w-3 animate-spin" />}
            {polling
              ? t("waitingApproval")
              : busy
                ? t("sendingPrompt")
                : t("payAmount", { amount: formatRWF(priceMonthly) })}
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-sand-dark px-3 py-2 text-xs font-semibold text-ink-soft hover:border-brand hover:text-brand">
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Upload className="h-3 w-3" />
          )}
          {busy ? tc("uploading") : t("uploadProof")}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={payByTransfer}
            disabled={busy}
            className="hidden"
          />
        </label>
      )}

      {notice && (
        <div className="flex items-start gap-1.5 rounded-lg bg-brand-wash p-2">
          <CheckCircle2 className="mt-px h-3 w-3 shrink-0 text-success" />
          <p className="text-[11px] text-brand-deepest">{notice}</p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-1.5 rounded-lg bg-danger-bg p-2">
          <AlertCircle className="mt-px h-3 w-3 shrink-0 text-danger" />
          <p className="text-[11px] text-danger">{error}</p>
        </div>
      )}

      {!polling && (
        <button
          onClick={() => {
            setOpen(false);
            setError(null);
            setNotice(null);
          }}
          className="w-full text-[11px] font-semibold text-ink-faint"
        >
          {tc("cancel")}
        </button>
      )}
    </div>
  );
}

function MethodTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold ${
        active
          ? "bg-brand text-white"
          : "border border-sand-dark text-ink-soft"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
