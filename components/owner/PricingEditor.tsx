"use client";

/**
 * PricingEditor — an owner sets their own rates.
 *
 * Replaces a read-only table. Before this, the only way to price a car was the
 * create-a-car wizard, so a mistyped daily rate was permanent.
 *
 * The reassurance about existing bookings is not marketing copy — it is how the
 * system actually works. Bookings snapshot their rates at the moment they are
 * made, so changing a price here genuinely cannot alter a trip already booked.
 * Owners hesitate to correct prices without being told that.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { formatMoney } from "@/lib/currency";
import { Loader2, Wallet, Check, AlertCircle } from "lucide-react";

export interface PricingValues {
  perDayInCity: number;
  perDayOutsideCity: number;
  perWeekInCity: number;
  perWeekOutsideCity: number;
  perMonth: number;
  driverEnabled: boolean;
  driverSurchargePerDay: number;
  depositEnabled: boolean;
  depositAmount: number | null;
}

// Keys, not text — module scope has no translator.
const FIELDS: { key: keyof PricingValues; labelKey: string; hintKey?: string }[] = [
  { key: "perDayInCity", labelKey: "perDayInCity" },
  { key: "perDayOutsideCity", labelKey: "perDayOutside" },
  { key: "perWeekInCity", labelKey: "perWeekInCity" },
  { key: "perWeekOutsideCity", labelKey: "perWeekOutside" },
  { key: "perMonth", labelKey: "perMonth", hintKey: "flatRateAnywhere" },
];

export default function PricingEditor({
  carId,
  initial,
}: {
  carId: string;
  initial: PricingValues | null;
}) {
  const t = useTranslations("carForm");
  const tc = useTranslations("common");
  const router = useRouter();

  const [values, setValues] = useState<PricingValues>(
    initial ?? {
      perDayInCity: 0,
      perDayOutsideCity: 0,
      perWeekInCity: 0,
      perWeekOutsideCity: 0,
      perMonth: 0,
      driverEnabled: false,
      driverSurchargePerDay: 0,
      depositEnabled: false,
      depositAmount: null,
    },
  );

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setNumber(key: keyof PricingValues, raw: string) {
    // Strip anything that isn't a digit so a pasted "45,000 RWF" still works.
    const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
    setValues((v) => ({ ...v, [key]: Number.isNaN(n) ? 0 : n }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/cars/${carId}/pricing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We couldn't save those rates.");
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

  const inputCls =
    "w-full rounded-lg border border-sand-dark px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <Wallet className="h-4 w-4 text-brand" />
        <h2 className="text-sm font-semibold text-ink">{t("pricing")}</h2>
      </div>
      <p className="mb-4 text-xs text-ink-soft">
        Changing these affects new bookings only — trips already booked keep the
        price that was agreed.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label
              htmlFor={`${carId}-${f.key}`}
              className="mb-1 block text-xs font-medium text-ink-muted"
            >
              {t(f.labelKey)}
            </label>
            <input
              id={`${carId}-${f.key}`}
              inputMode="numeric"
              value={(values[f.key] as number) || ""}
              onChange={(e) => setNumber(f.key, e.target.value)}
              placeholder="0"
              className={inputCls}
            />
            <p className="mt-0.5 text-[11px] text-ink-faint">
              {f.hintKey
                ? t(f.hintKey)
                : formatMoney((values[f.key] as number) || 0)}
            </p>
          </div>
        ))}
      </div>

      {/* Driver */}
      <div className="mt-4 border-t border-sand pt-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={values.driverEnabled}
            onChange={(e) => {
              setValues((v) => ({ ...v, driverEnabled: e.target.checked }));
              setSaved(false);
            }}
            className="accent-brand"
          />
          {t("offerWithDriver")}
        </label>

        {values.driverEnabled && (
          <div className="mt-2 max-w-xs">
            <label
              htmlFor={`${carId}-driver`}
              className="mb-1 block text-xs font-medium text-ink-muted"
            >
              {t("driverSurchargeDay")}
            </label>
            <input
              id={`${carId}-driver`}
              inputMode="numeric"
              value={values.driverSurchargePerDay || ""}
              onChange={(e) => setNumber("driverSurchargePerDay", e.target.value)}
              className={inputCls}
            />
            <p className="mt-0.5 text-[11px] text-ink-faint">
              Charged for every day of the trip, including on weekly and monthly
              rentals.
            </p>
          </div>
        )}
      </div>

      {/* Deposit */}
      <div className="mt-4 border-t border-sand pt-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={values.depositEnabled}
            onChange={(e) => {
              setValues((v) => ({
                ...v,
                depositEnabled: e.target.checked,
                depositAmount: e.target.checked ? (v.depositAmount ?? 0) : null,
              }));
              setSaved(false);
            }}
            className="accent-brand"
          />
          {t("askForDeposit")}
        </label>

        {values.depositEnabled && (
          <div className="mt-2 max-w-xs">
            <label
              htmlFor={`${carId}-deposit`}
              className="mb-1 block text-xs font-medium text-ink-muted"
            >
              {t("depositAmount")}
            </label>
            <input
              id={`${carId}-deposit`}
              inputMode="numeric"
              value={values.depositAmount || ""}
              onChange={(e) => setNumber("depositAmount", e.target.value)}
              className={inputCls}
            />
            <p className="mt-0.5 text-[11px] text-ink-faint">
              ZuriDrive holds this for the trip and releases it back to the
              renter once you both confirm the return. Commission is never taken
              on a deposit.
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving…" : "Save rates"}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-xs font-medium text-success">
            <Check className="h-3.5 w-3.5" />{tc("saved")}</span>
        )}
      </div>
    </section>
  );
}
