"use client";

/**
 * CarEditForm — edit an existing listing.
 *
 * Deliberately narrower than the creation wizard: status, featured flag and
 * ownership are admin-controlled and are not represented here at all, so they
 * can't be smuggled into the PATCH.
 *
 * Pricing lives on a separate table and is saved through its own endpoint.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Loader2, Check, AlertCircle, Power } from "lucide-react";

interface Props {
  carId: string;
  initial: {
    make: string;
    model: string;
    year: string;
    color: string;
    licensePlate: string;
    category: string;
    fuelType: string;
    transmission: string;
    seatingCapacity: string;
    minBookingDays: string;
    deliverAnywhere: boolean;
    deliveryFee: string;
    isActive: boolean;
  };
}

export default function CarEditForm({ carId, initial }: Props) {
  const t = useTranslations("carForm");
  const tc = useTranslations("common");
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/cars/${carId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          make: form.make.trim(),
          model: form.model.trim(),
          year: Number(form.year),
          color: form.color.trim(),
          licensePlate: form.licensePlate.trim().toUpperCase(),
          category: form.category,
          fuelType: form.fuelType,
          transmission: form.transmission,
          seatingCapacity: Number(form.seatingCapacity),
          minBookingDays: Number(form.minBookingDays),
          deliverAnywhere: form.deliverAnywhere,
          deliveryFee: form.deliverAnywhere ? Number(form.deliveryFee || 0) : undefined,
          isActive: form.isActive,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? t("couldntSaveChanges"));
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
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-ink">
          {t("carDetails")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("make")}>
            <input className={cls} value={form.make} onChange={(e) => set("make", e.target.value)} />
          </Field>
          <Field label={t("model")}>
            <input className={cls} value={form.model} onChange={(e) => set("model", e.target.value)} />
          </Field>
          <Field label={t("year")}>
            <input className={cls} value={form.year} onChange={(e) => set("year", e.target.value)} inputMode="numeric" />
          </Field>
          <Field label={t("colour")}>
            <input className={cls} value={form.color} onChange={(e) => set("color", e.target.value)} />
          </Field>
          <Field label={t("numberPlate")}>
            <input className={cls} value={form.licensePlate} onChange={(e) => set("licensePlate", e.target.value)} />
          </Field>
          <Field label={t("seats")}>
            <input className={cls} value={form.seatingCapacity} onChange={(e) => set("seatingCapacity", e.target.value)} inputMode="numeric" />
          </Field>
          <Field label={t("category")}>
            <select className={cls} value={form.category} onChange={(e) => set("category", e.target.value)}>
              {["ECONOMY", "SUV", "LUXURY", "VAN", "MINIBUS"].map((c) => (
                <option key={c} value={c}>{t(c)}</option>
              ))}
            </select>
          </Field>
          <Field label={t("fuelType")}>
            <select className={cls} value={form.fuelType} onChange={(e) => set("fuelType", e.target.value)}>
              {["PETROL", "DIESEL", "ELECTRIC", "HYBRID"].map((c) => (
                <option key={c} value={c}>{t(c)}</option>
              ))}
            </select>
          </Field>
          <Field label={t("transmission")}>
            <select className={cls} value={form.transmission} onChange={(e) => set("transmission", e.target.value)}>
              {["MANUAL", "AUTOMATIC"].map((c) => (
                <option key={c} value={c}>{t(c)}</option>
              ))}
            </select>
          </Field>
          <Field label={t("minBookingDays")}>
            <input className={cls} value={form.minBookingDays} onChange={(e) => set("minBookingDays", e.target.value)} inputMode="numeric" />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-ink">{t("delivery")}</h2>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={form.deliverAnywhere}
            onChange={(e) => set("deliverAnywhere", e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-sand-dark text-brand"
          />
          <span>
            <span className="block text-sm font-medium text-ink">
              {t("deliverAnywhere")}
            </span>
            <span className="block text-xs text-ink-soft">
              {t("deliverAnywhereNote")}
            </span>
          </span>
        </label>
        {form.deliverAnywhere && (
          <div className="mt-3 max-w-xs">
            <Field label={t("deliveryFeeRwf")}>
              <input
                className={cls}
                value={form.deliveryFee}
                onChange={(e) => set("deliveryFee", e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
              />
            </Field>
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Power className="h-3.5 w-3.5" />
              {t("acceptingBookings")}
            </h2>
            <p className="mt-0.5 text-xs text-ink-soft">
              Turn this off to pause new bookings without removing the listing.
              Existing bookings are unaffected.
            </p>
          </div>
          <button
            type="button"
            onClick={() => set("isActive", !form.isActive)}
            className={`mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
              form.isActive ? "bg-brand" : "bg-sand-dark"
            }`}
            aria-label={t("toggleAccepting")}
          >
            <span
              className={`h-5 w-5 rounded-full bg-white transition-transform ${
                form.isActive ? "translate-x-5" : ""
              }`}
            />
          </button>
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
          {saving ? "Saving…" : "Save changes"}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-success">
            <Check className="h-4 w-4" />{tc("saved")}</span>
        )}
      </div>
    </div>
  );
}

const cls =
  "w-full rounded-lg border border-sand-dark bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20";

function t(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
