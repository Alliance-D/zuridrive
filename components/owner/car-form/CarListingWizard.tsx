"use client";

/**
 * CarListingWizard — 5-step car listing flow.
 *
 * Steps: Basics → Photos → Pricing → Availability → Fuel & pickup
 *
 * Validation happens per step so owners can't advance past a mistake, and the
 * whole payload is posted once at the end to /api/owner/cars, which creates
 * the car and all its related rows in a single transaction.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { currencyCode, formatMoney } from '@/lib/currency';
import {
  Car,
  Camera,
  Wallet,
  CalendarDays,
  Fuel,
  Check,
  ChevronLeft,
  ChevronRight,
  Upload,
  X,
  Loader2,
  AlertCircle,
} from "lucide-react";

// Keys, not text — module scope has no translator.
const STEPS = [
  { n: 1, labelKey: "stepBasics", icon: Car },
  { n: 2, labelKey: "stepPhotos", icon: Camera },
  { n: 3, labelKey: "stepPricing", icon: Wallet },
  { n: 4, labelKey: "stepAvailability", icon: CalendarDays },
  { n: 5, labelKey: "stepFuelPickup", icon: Fuel },
];

const MIN_PHOTOS = 3;

interface Neighborhood {
  id: string;
  name: string;
}

interface FormState {
  make: string;
  model: string;
  year: string;
  color: string;
  licensePlate: string;
  category: string;
  fuelType: string;
  transmission: string;
  seatingCapacity: string;

  photos: { url: string; publicId: string }[];

  perDayInCity: string;
  perDayOutsideCity: string;
  perWeekInCity: string;
  perWeekOutsideCity: string;
  perMonth: string;
  driverEnabled: boolean;
  driverSurchargePerDay: string;
  depositEnabled: boolean;
  depositAmount: string;

  minBookingDays: string;
  deliverAnywhere: boolean;
  deliveryFee: string;

  fuelPolicyType: string;
  refuelingFee: string;
  locationName: string;
  locationNeighborhoodId: string;
}

const INITIAL: FormState = {
  make: "", model: "", year: "", color: "", licensePlate: "",
  category: "ECONOMY", fuelType: "PETROL", transmission: "MANUAL",
  seatingCapacity: "5",
  photos: [],
  perDayInCity: "", perDayOutsideCity: "", perWeekInCity: "",
  perWeekOutsideCity: "", perMonth: "",
  driverEnabled: false, driverSurchargePerDay: "",
  depositEnabled: true, depositAmount: "",
  minBookingDays: "1", deliverAnywhere: false, deliveryFee: "",
  fuelPolicyType: "FULL_TO_FULL", refuelingFee: "",
  locationName: "", locationNeighborhoodId: "",
};

export default function CarListingWizard({
  neighborhoods,
}: {
  neighborhoods: Neighborhood[];
}) {
  const t = useTranslations("carForm");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [restoring, setRestoring] = useState(true);
  // Set once the listing is published, so unmount does not re-save a draft for
  // a listing that no longer needs one.
  const finished = useRef(false);

  // ── Draft: pick up where the owner left off ───────────────────────────────
  //
  // Everything lived in browser memory until the final submit, so a dead
  // battery or a mistapped back button lost five steps of work and up to ten
  // uploaded photos. The photos themselves are already on Cloudinary by this
  // point — it was only the record of them that was fragile.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/owner/cars/draft");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data.draft) return;
        setForm((current) => ({ ...current, ...(data.draft.form as FormState) }));
        setStep(data.draft.step ?? 1);
        setSavedAt(new Date(data.draft.savedAt));
      } catch {
        // A draft that will not load is not worth blocking the form over.
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Saved when the owner moves between steps rather than on a timer.
   *
   * A 60-second timer writes half-typed fields and costs a request a minute
   * per owner for the whole time the form is open. Step boundaries are where
   * the work is actually complete, and they are the points someone is likely
   * to stop at.
   */
  const saveDraft = useCallback(
    async (formNow: FormState, stepNow: number) => {
      if (finished.current) return;
      try {
        const res = await fetch("/api/owner/cars/draft", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ form: formNow, step: stepNow }),
        });
        if (res.ok) setSavedAt(new Date((await res.json()).savedAt));
      } catch {
        // Silent: a failed save must never interrupt someone mid-listing. The
        // banner simply keeps showing the last time that did work.
      }
    },
    [],
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  }

  // ── Per-step validation ──────────────────────────────────────────────────
  function validateStep(n: number): boolean {
    const e: Record<string, string> = {};
    const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

    if (n === 1) {
      if (!form.make.trim()) e.make = t("required");
      if (!form.model.trim()) e.model = t("required");
      const y = num(form.year);
      if (!Number.isFinite(y) || y < 1980 || y > new Date().getFullYear() + 1)
        e.year = t("enterValidYear");
      if (!form.color.trim()) e.color = t("required");
      if (form.licensePlate.trim().length < 3) e.licensePlate = t("required");
      const seats = num(form.seatingCapacity);
      if (!Number.isFinite(seats) || seats < 1) e.seatingCapacity = t("required");
    }

    if (n === 2 && form.photos.length < MIN_PHOTOS) {
      e.photos = t("addAtLeastPhotos", { count: MIN_PHOTOS });
    }

    if (n === 3) {
      for (const key of [
        "perDayInCity", "perDayOutsideCity", "perWeekInCity",
        "perWeekOutsideCity", "perMonth",
      ] as const) {
        const v = num(form[key]);
        if (!Number.isFinite(v) || v < 1) e[key] = "Required";
      }
      if (form.driverEnabled && !(num(form.driverSurchargePerDay) >= 0))
        e.driverSurchargePerDay = t("setDailySurcharge");
      if (form.depositEnabled && !(num(form.depositAmount) > 0))
        e.depositAmount = t("setDepositAmount");
    }

    if (n === 4) {
      const d = num(form.minBookingDays);
      if (!Number.isFinite(d) || d < 1) e.minBookingDays = t("mustBeAtLeastOne");
      if (form.deliverAnywhere && !(num(form.deliveryFee) >= 0))
        e.deliveryFee = t("setDeliveryFee");
    }

    if (n === 5) {
      if (form.fuelPolicyType === "FULL_TO_FULL" && !(num(form.refuelingFee) >= 0))
        e.refuelingFee = t("setRefuelFee");
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (!validateStep(step)) return;
    const to = Math.min(5, step + 1);
    setStep(to);
    void saveDraft(form, to);
  }
  function back() {
    const to = Math.max(1, step - 1);
    setStep(to);
    void saveDraft(form, to);
  }

  // ── Photo upload ─────────────────────────────────────────────────────────
  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setUploading(true);
    try {
      for (const file of files) {
        if (form.photos.length >= 12) break;

        const fd = new FormData();
        fd.append("file", file);
        fd.append("folder", "car_photos");

        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();

        if (!res.ok) {
          setErrors((prev) => ({ ...prev, photos: data.error ?? t("uploadFailed") }));
          break;
        }

        setForm((f) => ({
          ...f,
          photos: [...f.photos, { url: data.url, publicId: data.publicId ?? "" }],
        }));
      }
    } catch {
      setErrors((prev) => ({ ...prev, photos: t("uploadFailedRetry") }));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function removePhoto(index: number) {
    setForm((f) => ({ ...f, photos: f.photos.filter((_, i) => i !== index) }));
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  async function submit() {
    if (!validateStep(5)) return;

    setSubmitting(true);
    setSubmitError(null);

    const payload = {
      make: form.make.trim(),
      model: form.model.trim(),
      year: Number(form.year),
      color: form.color.trim(),
      licensePlate: form.licensePlate.trim().toUpperCase(),
      category: form.category,
      fuelType: form.fuelType,
      transmission: form.transmission,
      seatingCapacity: Number(form.seatingCapacity),
      photos: form.photos,
      perDayInCity: Number(form.perDayInCity),
      perDayOutsideCity: Number(form.perDayOutsideCity),
      perWeekInCity: Number(form.perWeekInCity),
      perWeekOutsideCity: Number(form.perWeekOutsideCity),
      perMonth: Number(form.perMonth),
      driverEnabled: form.driverEnabled,
      driverSurchargePerDay: form.driverEnabled
        ? Number(form.driverSurchargePerDay)
        : undefined,
      depositEnabled: form.depositEnabled,
      depositAmount: form.depositEnabled ? Number(form.depositAmount) : undefined,
      minBookingDays: Number(form.minBookingDays),
      deliverAnywhere: form.deliverAnywhere,
      deliveryFee: form.deliverAnywhere ? Number(form.deliveryFee) : undefined,
      fuelPolicyType: form.fuelPolicyType,
      refuelingFee:
        form.fuelPolicyType === "FULL_TO_FULL"
          ? Number(form.refuelingFee)
          : undefined,
      locations: form.locationName.trim()
        ? [
            {
              name: form.locationName.trim(),
              neighborhoodId: form.locationNeighborhoodId || undefined,
            },
          ]
        : [],
    };

    try {
      const res = await fetch("/api/owner/cars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error ?? t("somethingWentWrong"));
        return;
      }

      // Published: the draft has done its job and must not reappear next time
      // the owner opens the wizard.
      finished.current = true;
      await fetch("/api/owner/cars/draft", { method: "DELETE" }).catch(() => {});

      router.push("/owner/fleet?submitted=1");
      router.refresh();
    } catch {
      setSubmitError(tc("networkError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Saved-state line. The point of a draft is the confidence to close the
          tab, and that only works if the owner can see it happened. */}
      {savedAt && !restoring && (
        <p className="text-fluid-xs text-ink-soft" role="status">
          {t("draftSaved", {
            time: savedAt.toLocaleTimeString(locale, {
              hour: "2-digit",
              minute: "2-digit",
            }),
          })}
        </p>
      )}

      {/* ── Step indicator ────────────────────────────────────────────── */}
      <ol className="flex items-center gap-1">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = step > s.n;
          const current = step === s.n;
          return (
            <li key={s.n} className="flex flex-1 items-center gap-1">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                    done
                      ? "bg-brand text-white"
                      : current
                        ? "bg-accent text-white"
                        : "bg-sand text-ink-faint"
                  }`}
                >
                  {done ? <Check className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
                </div>
                <span
                  className={`hidden text-[10px] sm:block ${
                    current ? "font-semibold text-brand" : "text-ink-faint"
                  }`}
                >
                  {t(s.labelKey)}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-0.5 flex-1 ${done ? "bg-brand" : "bg-sand"}`}
                />
              )}
            </li>
          );
        })}
      </ol>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        {/* ── Step 1: Basics ─────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <StepHeader
              title={t("tellUsAboutCar")}
              subtitle={t("detailsAppear")}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("make")} error={errors.make}>
                <input
                  className={inputCls(errors.make)}
                  value={form.make}
                  onChange={(e) => update("make", e.target.value)}
                  placeholder={t("makePlaceholder")}
                />
              </Field>
              <Field label={t("model")} error={errors.model}>
                <input
                  className={inputCls(errors.model)}
                  value={form.model}
                  onChange={(e) => update("model", e.target.value)}
                  placeholder={t("modelPlaceholder")}
                />
              </Field>
              <Field label={t("year")} error={errors.year}>
                <input
                  className={inputCls(errors.year)}
                  value={form.year}
                  onChange={(e) => update("year", e.target.value)}
                  inputMode="numeric"
                  placeholder={t("yearPlaceholder")}
                />
              </Field>
              <Field label={t("colour")} error={errors.color}>
                <input
                  className={inputCls(errors.color)}
                  value={form.color}
                  onChange={(e) => update("color", e.target.value)}
                  placeholder={t("colourPlaceholder")}
                />
              </Field>
              <Field label={t("numberPlate")} error={errors.licensePlate}>
                <input
                  className={inputCls(errors.licensePlate)}
                  value={form.licensePlate}
                  onChange={(e) => update("licensePlate", e.target.value)}
                  placeholder={t("platePlaceholder")}
                />
              </Field>
              <Field label={t("seats")} error={errors.seatingCapacity}>
                <input
                  className={inputCls(errors.seatingCapacity)}
                  value={form.seatingCapacity}
                  onChange={(e) => update("seatingCapacity", e.target.value)}
                  inputMode="numeric"
                />
              </Field>
              <Field label={t("category")}>
                <select
                  className={inputCls()}
                  value={form.category}
                  onChange={(e) => update("category", e.target.value)}
                >
                  {["ECONOMY", "SUV", "LUXURY", "VAN", "MINIBUS"].map((c) => (
                    <option key={c} value={c}>
                      {title(c)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("fuelType")}>
                <select
                  className={inputCls()}
                  value={form.fuelType}
                  onChange={(e) => update("fuelType", e.target.value)}
                >
                  {["PETROL", "DIESEL", "ELECTRIC", "HYBRID"].map((c) => (
                    <option key={c} value={c}>
                      {title(c)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("transmission")}>
                <select
                  className={inputCls()}
                  value={form.transmission}
                  onChange={(e) => update("transmission", e.target.value)}
                >
                  {["MANUAL", "AUTOMATIC"].map((c) => (
                    <option key={c} value={c}>
                      {title(c)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        )}

        {/* ── Step 2: Photos ─────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <StepHeader
              title={t("addPhotos")}
              subtitle={`At least ${MIN_PHOTOS}. The first one becomes your cover image.`}
            />

            {form.photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {form.photos.map((p, i) => (
                  <div
                    key={p.url + i}
                    className="relative aspect-video overflow-hidden rounded-lg bg-sand"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                    {i === 0 && (
                      <span className="absolute left-1 top-1 rounded bg-brand px-1.5 py-0.5 text-[9px] font-bold text-white">
                        {t("cover")}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                      aria-label={t("removePhoto")}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-sand-dark p-6 hover:border-brand">
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-brand" />
              ) : (
                <Upload className="h-6 w-6 text-ink-faint" />
              )}
              <span className="text-sm font-medium text-ink-muted">
                {uploading ? "Uploading…" : "Choose photos"}
              </span>
              <span className="text-xs text-ink-faint">
                JPG, PNG or WebP · max 5MB each · {form.photos.length}/12 added
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={handlePhotoUpload}
                disabled={uploading || form.photos.length >= 12}
                className="hidden"
              />
            </label>

            {errors.photos && <ErrorText>{errors.photos}</ErrorText>}
          </div>
        )}

        {/* ── Step 3: Pricing ────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <StepHeader
              title={t("setYourRates")}
              subtitle={t("ratesNote")}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("perDayInCity")} error={errors.perDayInCity}>
                <MoneyInput
                  value={form.perDayInCity}
                  onChange={(v) => update("perDayInCity", v)}
                  error={errors.perDayInCity}
                />
              </Field>
              <Field label={t("perDayOutside")} error={errors.perDayOutsideCity}>
                <MoneyInput
                  value={form.perDayOutsideCity}
                  onChange={(v) => update("perDayOutsideCity", v)}
                  error={errors.perDayOutsideCity}
                />
              </Field>
              <Field label={t("perWeekInCity")} error={errors.perWeekInCity}>
                <MoneyInput
                  value={form.perWeekInCity}
                  onChange={(v) => update("perWeekInCity", v)}
                  error={errors.perWeekInCity}
                />
              </Field>
              <Field label={t("perWeekOutside")} error={errors.perWeekOutsideCity}>
                <MoneyInput
                  value={form.perWeekOutsideCity}
                  onChange={(v) => update("perWeekOutsideCity", v)}
                  error={errors.perWeekOutsideCity}
                />
              </Field>
              <Field label={t("perMonthFlat")} error={errors.perMonth}>
                <MoneyInput
                  value={form.perMonth}
                  onChange={(v) => update("perMonth", v)}
                  error={errors.perMonth}
                />
              </Field>
            </div>

            <Toggle
              label={t("offerADriver")}
              description={t("chargedPerDay")}
              checked={form.driverEnabled}
              onChange={(v) => update("driverEnabled", v)}
            />
            {form.driverEnabled && (
              <Field label={t("driverSurchargePerDay")} error={errors.driverSurchargePerDay}>
                <MoneyInput
                  value={form.driverSurchargePerDay}
                  onChange={(v) => update("driverSurchargePerDay", v)}
                  error={errors.driverSurchargePerDay}
                />
              </Field>
            )}

            <Toggle
              label={t("requireDeposit")}
              description={t("depositNote")}
              checked={form.depositEnabled}
              onChange={(v) => update("depositEnabled", v)}
            />
            {form.depositEnabled && (
              <Field label={t("depositAmount")} error={errors.depositAmount}>
                <MoneyInput
                  value={form.depositAmount}
                  onChange={(v) => update("depositAmount", v)}
                  error={errors.depositAmount}
                />
              </Field>
            )}

            {Number(form.perDayInCity) > 0 && (
              <div className="rounded-xl bg-bone p-3 text-xs">
                <p className="font-semibold text-ink">
                  On a 3-day in-city booking you&apos;d receive
                </p>
                <p className="mt-1 text-ink-soft">
                  {formatMoney(Number(form.perDayInCity) * 3)} rental −{" "}
                  {formatMoney(Math.round(Number(form.perDayInCity) * 3 * 0.2))}{" "}
                  commission ={" "}
                  <strong className="text-brand">
                    {formatMoney(
                      Number(form.perDayInCity) * 3 -
                        Math.round(Number(form.perDayInCity) * 3 * 0.2),
                    )}
                  </strong>
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Availability ───────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-4">
            <StepHeader
              title={t("availabilityDelivery")}
              subtitle={t("blockDatesLater")}
            />

            <Field
              label={t("minBookingLength")}
              error={errors.minBookingDays}
            >
              <input
                className={inputCls(errors.minBookingDays)}
                value={form.minBookingDays}
                onChange={(e) => update("minBookingDays", e.target.value)}
                inputMode="numeric"
              />
            </Field>

            <Toggle
              label={t("deliverAnywhere")}
              description={t("deliverAnywhereNote")}
              checked={form.deliverAnywhere}
              onChange={(v) => update("deliverAnywhere", v)}
            />
            {form.deliverAnywhere && (
              <Field label={t("deliveryFee")} error={errors.deliveryFee}>
                <MoneyInput
                  value={form.deliveryFee}
                  onChange={(v) => update("deliveryFee", v)}
                  error={errors.deliveryFee}
                />
              </Field>
            )}
          </div>
        )}

        {/* ── Step 5: Fuel & pickup ──────────────────────────────────── */}
        {step === 5 && (
          <div className="space-y-4">
            <StepHeader
              title={t("fuelPolicyPickup")}
              subtitle={t("fuelDisputesNote")}
            />

            <Field label={t("fuelPolicy")}>
              <select
                className={inputCls()}
                value={form.fuelPolicyType}
                onChange={(e) => update("fuelPolicyType", e.target.value)}
              >
                <option value="FULL_TO_FULL">{t("fuelFullToFull")}</option>
                <option value="SAME_LEVEL">{t("fuelSameLevel")}</option>
                <option value="FREE_TANK">{t("fuelFreeTank")}</option>
                <option value="OWNER_HANDLES">{t("fuelOwnerHandles")}</option>
              </select>
            </Field>

            {form.fuelPolicyType === "FULL_TO_FULL" && (
              <Field
                label={t("refuelFee")}
                error={errors.refuelingFee}
              >
                <MoneyInput
                  value={form.refuelingFee}
                  onChange={(v) => update("refuelingFee", v)}
                  error={errors.refuelingFee}
                />
              </Field>
            )}

            <div className="border-t border-sand pt-4">
              <Field label={t("ownPickupPoint")}>
                <input
                  className={inputCls()}
                  value={form.locationName}
                  onChange={(e) => update("locationName", e.target.value)}
                  placeholder={t("pickupPlaceholder")}
                />
              </Field>
              {form.locationName.trim() && (
                <div className="mt-3">
                  <Field label={t("neighbourhood")}>
                    <select
                      className={inputCls()}
                      value={form.locationNeighborhoodId}
                      onChange={(e) =>
                        update("locationNeighborhoodId", e.target.value)
                      }
                    >
                      <option value="">Select…</option>
                      {neighborhoods.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}
              <p className="mt-2 text-xs text-ink-faint">
                Custom pickup points are reviewed before they appear to clients.
                Platform locations (airport, convention centre) are always available.
              </p>
            </div>

            <div className="rounded-xl bg-warning-bg p-3">
              <p className="text-xs text-warning">
                Your listing goes to our team for review. Most are approved within
                a day, and we&apos;ll text you when it&apos;s live.
              </p>
            </div>

            {submitError && (
              <div className="flex items-start gap-2 rounded-xl bg-danger-bg p-3">
                <AlertCircle className="mt-px h-4 w-4 shrink-0 text-danger" />
                <p className="text-xs text-danger">{submitError}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Navigation ─────────────────────────────────────────────── */}
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-sand pt-4">
          <button
            type="button"
            onClick={back}
            disabled={step === 1 || submitting}
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-ink-soft disabled:invisible hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" />
            {t("back")}
          </button>

          {step < 5 ? (
            <button
              type="button"
              onClick={next}
              className="flex items-center gap-1 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              {t("continue")}
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? t("submitting") : t("submitForReview")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Small presentational helpers ───────────────────────────────────────────

function inputCls(error?: string) {
  return `w-full rounded-lg border px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 ${
    error ? "border-danger-soft bg-danger-tint" : "border-sand-dark bg-white"
  }`;
}

function title(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-base font-bold text-ink">{title}</h2>
      <p className="mt-0.5 text-xs text-ink-soft">{subtitle}</p>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-muted">
        {label}
      </label>
      {children}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-danger-strong">{children}</p>;
}

function MoneyInput({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint">
        {currencyCode}
      </span>
      <input
        className={`${inputCls(error)} pl-11`}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        inputMode="numeric"
        placeholder="0"
      />
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-xl border border-sand-dark p-3 text-left hover:border-brand"
    >
      <span
        className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          checked ? "bg-brand" : "bg-sand-dark"
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-ink-soft">{description}</span>
      </span>
    </button>
  );
}
