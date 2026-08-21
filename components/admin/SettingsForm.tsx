"use client";

/**
 * SettingsForm — platform configuration.
 *
 * The commission rate gets an explicit warning because it's the one value that
 * changes how much money the platform takes. It only affects *new* bookings —
 * every existing Booking and Commission row keeps the rate it was created
 * with — and the form says so, because that is the first thing anyone
 * changing it will worry about.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/currency";
import { Loader2, Check, AlertCircle, AlertTriangle } from "lucide-react";

export interface SettingsValues {
  commissionRatePercent: number;
  largePayoutThreshold: number;
  autoPublishListings: boolean;
  freeTierMaxListings: number;
  lateCancellationWindowHours: number;
  lateCancellationFeePercent: number;
  photoRetentionDays: number;
  ownerConfirmWindowHours: number;
  autoCompleteHours: number;
}

export default function SettingsForm({
  initial,
  limits,
}: {
  initial: SettingsValues;
  limits: Record<string, { min: number; max: number }>;
}) {
  const t = useTranslations("adminForms");
  const tc = useTranslations("common");
  const router = useRouter();
  const [form, setForm] = useState({
    commissionRatePercent: String(initial.commissionRatePercent),
    largePayoutThreshold: String(initial.largePayoutThreshold),
    autoPublishListings: initial.autoPublishListings,
    freeTierMaxListings: String(initial.freeTierMaxListings),
    lateCancellationWindowHours: String(initial.lateCancellationWindowHours),
    lateCancellationFeePercent: String(initial.lateCancellationFeePercent),
    photoRetentionDays: String(initial.photoRetentionDays),
    ownerConfirmWindowHours: String(initial.ownerConfirmWindowHours),
    autoCompleteHours: String(initial.autoCompleteHours),
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  const rateChanged =
    Number(form.commissionRatePercent) !== initial.commissionRatePercent;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commissionRatePercent: Number(form.commissionRatePercent),
          largePayoutThreshold: Number(form.largePayoutThreshold),
          autoPublishListings: form.autoPublishListings,
          freeTierMaxListings: Number(form.freeTierMaxListings),
          lateCancellationWindowHours: Number(form.lateCancellationWindowHours),
          lateCancellationFeePercent: Number(form.lateCancellationFeePercent),
          photoRetentionDays: Number(form.photoRetentionDays),
          ownerConfirmWindowHours: Number(form.ownerConfirmWindowHours),
          autoCompleteHours: Number(form.autoCompleteHours),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("couldNotSaveSettings"));
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError(tc("networkRetry"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Finance */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-ink">{t("finance")}</h2>
        <p className="mb-3 text-xs text-ink-soft">
          These affect how much the platform earns and when a payout needs
          extra sign-off.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={t("commissionRate")}
            hint={`Between ${limits.commissionRatePercent.min}% and ${limits.commissionRatePercent.max}%`}
          >
            <input
              className={input}
              value={form.commissionRatePercent}
              onChange={(e) =>
                set("commissionRatePercent", e.target.value.replace(/[^\d]/g, ""))
              }
              inputMode="numeric"
            />
          </Field>

          <Field
            label={t("largePayoutThreshold")}
            hint={
              Number(form.largePayoutThreshold) > 0
                ? `${formatMoney(Number(form.largePayoutThreshold))} and above needs Super Admin approval`
                : "Every payout will need Super Admin approval"
            }
          >
            <input
              className={input}
              value={form.largePayoutThreshold}
              onChange={(e) =>
                set("largePayoutThreshold", e.target.value.replace(/[^\d]/g, ""))
              }
              inputMode="numeric"
            />
          </Field>
        </div>

        {rateChanged && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-warning-bg p-3">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-warning-strong" />
            <div className="text-xs text-warning">
              <p className="font-semibold">
                Changing the commission rate from {initial.commissionRatePercent}%
                to {form.commissionRatePercent || "0"}%
              </p>
              <p className="mt-0.5">
                {t.rich("commissionChangeNote", {
                  b: (chunks) => <strong>{chunks}</strong>,
                })}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Fleet */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-ink">{t("fleet")}</h2>
        <button
          type="button"
          onClick={() => set("autoPublishListings", !form.autoPublishListings)}
          className="flex w-full items-start gap-3 rounded-xl border border-sand-dark p-3 text-left hover:border-brand"
        >
          <span
            className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
              form.autoPublishListings ? "bg-brand" : "bg-sand-dark"
            }`}
          >
            <span
              className={`h-4 w-4 rounded-full bg-white transition-transform ${
                form.autoPublishListings ? "translate-x-4" : ""
              }`}
            />
          </span>
          <span>
            <span className="block text-sm font-medium text-ink">
              {t("autoPublish")}
            </span>
            <span className="block text-xs text-ink-soft">
              {form.autoPublishListings
                ? t("autoPublishOn")
                : t("autoPublishOff")}
            </span>
          </span>
        </button>
        {form.autoPublishListings && (
          <p className="mt-2 text-xs text-warning-strong">
            With this on, nobody checks a listing before clients can book it.
          </p>
        )}

        <div className="mt-4 max-w-xs border-t border-sand pt-4">
          <Field
            label={t("freeTierAllowance")}
            hint="Cars an owner can list without an active plan — also what a lapsed owner falls back to."
          >
            <input
              className={input}
              value={form.freeTierMaxListings}
              onChange={(e) =>
                set("freeTierMaxListings", e.target.value.replace(/[^\d]/g, ""))
              }
              inputMode="numeric"
            />
          </Field>
        </div>
      </section>

      {/* Cancellation policy */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-ink">
          {t("cancellationPolicy")}
        </h2>
        <p className="mb-3 text-xs text-ink-soft">
          {t.rich("cancellationNote", {
            b: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={t("feeWindow")}
            hint={
              Number(form.lateCancellationWindowHours) === 0
                ? "Zero — no cancellation is ever treated as late."
                : `Cancelling within ${form.lateCancellationWindowHours}h of the start time is late.`
            }
          >
            <input
              className={input}
              value={form.lateCancellationWindowHours}
              onChange={(e) =>
                set(
                  "lateCancellationWindowHours",
                  e.target.value.replace(/[^\d]/g, ""),
                )
              }
              inputMode="numeric"
            />
          </Field>

          <Field
            label={t("feePercent")}
            hint={`Between ${limits.lateCancellationFeePercent.min}% and ${limits.lateCancellationFeePercent.max}%`}
          >
            <input
              className={input}
              value={form.lateCancellationFeePercent}
              onChange={(e) =>
                set(
                  "lateCancellationFeePercent",
                  e.target.value.replace(/[^\d]/g, ""),
                )
              }
              inputMode="numeric"
            />
          </Field>
        </div>

        {/* A percentage is hard to judge in the abstract — show the money. */}
        <p className="mt-3 rounded-xl bg-bone p-3 text-xs text-ink-muted">
          On a {formatMoney(100_000)} deposit, a client cancelling{" "}
          {Number(form.lateCancellationWindowHours) > 0
            ? `less than ${form.lateCancellationWindowHours}h`
            : "at any point"}{" "}
          before pickup keeps{" "}
          <strong>
            {formatMoney(
              100_000 -
                Math.round(
                  (100_000 * Number(form.lateCancellationFeePercent || 0)) / 100,
                ),
            )}
          </strong>
          , and{" "}
          <strong>
            {formatMoney(
              Math.round(
                (100_000 * Number(form.lateCancellationFeePercent || 0)) / 100,
              ),
            )}
          </strong>{" "}
          goes to the owner. Their rental payment is always returned in full.
        </p>

        {Number(form.lateCancellationFeePercent) === 100 && (
          <p className="mt-2 text-xs text-warning-strong">
            At 100% the client gets none of their deposit back. Expect disputes.
          </p>
        )}
      </section>

      {/* Timers */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-ink">
          Timers &amp; retention
        </h2>
        <p className="mb-3 text-xs text-ink-soft">
          {t("scheduledJobsNote")}
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label={t("photoRetention")}
            hint={`${limits.photoRetentionDays.min}–${limits.photoRetentionDays.max} days after a trip ends`}
          >
            <input
              className={input}
              value={form.photoRetentionDays}
              onChange={(e) =>
                set("photoRetentionDays", e.target.value.replace(/[^\d]/g, ""))
              }
              inputMode="numeric"
            />
          </Field>

          <Field
            label={t("ownerConfirmHours")}
            hint="Before a booking auto-confirms"
          >
            <input
              className={input}
              value={form.ownerConfirmWindowHours}
              onChange={(e) =>
                set("ownerConfirmWindowHours", e.target.value.replace(/[^\d]/g, ""))
              }
              inputMode="numeric"
            />
          </Field>

          <Field
            label={t("autoCompleteHours")}
            hint="After a one-sided return confirmation"
          >
            <input
              className={input}
              value={form.autoCompleteHours}
              onChange={(e) =>
                set("autoCompleteHours", e.target.value.replace(/[^\d]/g, ""))
              }
              inputMode="numeric"
            />
          </Field>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-danger-bg p-3">
          <AlertCircle className="mt-px h-4 w-4 shrink-0 text-danger" />
          <p className="text-xs text-danger">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving…" : "Save settings"}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-success">
            <Check className="h-4 w-4" />
            {tc("saved")}
          </span>
        )}
      </div>
    </div>
  );
}

const input =
  "w-full rounded-lg border border-sand-dark bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-muted">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-ink-faint">{hint}</p>}
    </div>
  );
}
