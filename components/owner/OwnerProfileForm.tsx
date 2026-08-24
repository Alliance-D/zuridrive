"use client";

/**
 * OwnerProfileForm — identity + payout details.
 *
 * Payout details are the sensitive half: they decide where money lands, so the
 * form makes the current destination explicit and confirms every change.
 */

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Check, AlertCircle, Smartphone, Landmark, User } from "lucide-react";

interface Props {
  initial: {
    name: string;
    email: string;
    phone: string;
    momoNumber: string;
    bankName: string;
    bankAccountName: string;
    bankAccountNumber: string;
    ownerType: "INDIVIDUAL" | "COMPANY";
    businessName: string;
    registrationNumber: string;
    tin: string;
  };
}

export default function OwnerProfileForm({ initial }: Props) {
  const t = useTranslations("ownerProfile");
  const tc = useTranslations("common");
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
    setFieldErrors((e) => {
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  }

  function validate() {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e.name = t("errName");
    if (form.ownerType === "COMPANY" && form.businessName.trim().length < 2)
      e.businessName = t("errBusinessName");
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email))
      e.email = t("errEmail");

    // A bank destination is only usable if all three parts are present.
    const bankParts = [form.bankName, form.bankAccountName, form.bankAccountNumber];
    const filled = bankParts.filter((p) => p.trim()).length;
    if (filled > 0 && filled < 3)
      e.bankAccountNumber = t("errBankParts");

    setFieldErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (!validate()) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/owner/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? t("saveError"));
        return;
      }

      setSaved(true);
      router.refresh();
    } catch {
      setError(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Identity */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <User className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-ink">{t("yourDetails")}</h2>
        </div>

        {/* Who is listing. A company still has one person behind the login —
            their name stays on the account and on every action they take —
            but renters see the business name on the listing. */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium text-ink-muted">
            {t("listingAs")}
          </p>
          <div className="flex gap-2">
            {(["INDIVIDUAL", "COMPANY"] as const).map((ownerType) => (
              <button
                key={ownerType}
                type="button"
                onClick={() => set("ownerType", ownerType)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  form.ownerType === ownerType
                    ? "border-brand bg-brand text-white"
                    : "border-sand-edge bg-white text-ink-muted hover:border-brand"
                }`}
              >
                {ownerType === "INDIVIDUAL" ? t("myself") : t("aBusiness")}
              </button>
            ))}
          </div>
        </div>

        {form.ownerType === "COMPANY" && (
          <div className="mb-4 grid gap-3 rounded-xl bg-bone p-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label={t("businessName")} error={fieldErrors.businessName}>
                <input
                  className={cls(fieldErrors.businessName)}
                  value={form.businessName}
                  onChange={(e) => set("businessName", e.target.value)}
                  placeholder={t("businessNamePlaceholder")}
                />
              </Field>
              <p className="mt-1 text-[11px] text-ink-faint">
                {t("businessNameHint")}
              </p>
            </div>
            <Field label={t("rdbNumber")}>
              <input
                className={cls()}
                value={form.registrationNumber}
                onChange={(e) => set("registrationNumber", e.target.value)}
              />
            </Field>
            <Field label={t("tin")}>
              <input
                className={cls()}
                value={form.tin}
                onChange={(e) => set("tin", e.target.value)}
              />
            </Field>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("fullName")} error={fieldErrors.name}>
            <input
              className={cls(fieldErrors.name)}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label={t("phoneSignIn")}>
            <input
              className={`${cls()} bg-bone text-ink-soft`}
              value={form.phone}
              disabled
            />
          </Field>
          <Field label={t("emailOptional")} error={fieldErrors.email}>
            <input
              className={cls(fieldErrors.email)}
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              type="email"
            />
          </Field>
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          {t("phoneHint")}
        </p>
      </section>

      {/* Payout details */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-ink">
            {t("whereEarnings")}
          </h2>
        </div>
        <p className="mb-3 text-xs text-ink-soft">
          {t("addAtLeastOne")}
        </p>

        <Field label={t("momoNumber")}>
          <input
            className={cls()}
            value={form.momoNumber}
            onChange={(e) => set("momoNumber", e.target.value)}
            placeholder={t("momoPlaceholder")}
            inputMode="tel"
          />
        </Field>

        <div className="mt-4 border-t border-sand pt-4">
          <div className="mb-3 flex items-center gap-2">
            <Landmark className="h-4 w-4 text-ink-soft" />
            <p className="text-xs font-semibold text-ink-muted">
              {t("bankOptional")}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("bankName")}>
              <input
                className={cls()}
                value={form.bankName}
                onChange={(e) => set("bankName", e.target.value)}
                placeholder={t("bankNamePlaceholder")}
              />
            </Field>
            <Field label={t("accountName")}>
              <input
                className={cls()}
                value={form.bankAccountName}
                onChange={(e) => set("bankAccountName", e.target.value)}
              />
            </Field>
            <Field
              label={t("accountNumber")}
              error={fieldErrors.bankAccountNumber}
            >
              <input
                className={cls(fieldErrors.bankAccountNumber)}
                value={form.bankAccountNumber}
                onChange={(e) => set("bankAccountNumber", e.target.value)}
                inputMode="numeric"
              />
            </Field>
          </div>
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
          {saving ? tc("saving") : tc("saveChanges")}
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

function cls(error?: string) {
  return `w-full rounded-lg border px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 ${
    error ? "border-danger-soft bg-danger-tint" : "border-sand-dark bg-white"
  }`;
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
      {error && <p className="mt-1 text-xs text-danger-strong">{error}</p>}
    </div>
  );
}
