"use client";

/**
 * AddPlatformLocation — create a verified platform pickup point.
 *
 * The admin locations page could approve owner-submitted locations and edit
 * seeded ones, but had no way to add a new platform location at all. Opening a
 * pickup point at a new hotel or terminal meant editing the database by hand.
 *
 * Collapsed by default: this page's main job is working through the approval
 * queue, and a permanently open form would push that queue down the page.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Plus, Loader2, X, AlertCircle } from "lucide-react";

export default function AddPlatformLocation() {
  const t = useTranslations("adminActions");
  const tc = useTranslations("common");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setAddress("");
    setDescription("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim() || null,
          description: description.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("couldntCreateLocation"));
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    } catch {
      setError(tc("networkRetry"));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
      >
        <Plus className="h-4 w-4" />
        {t("addPlatformLocation")}
      </button>
    );
  }

  const inputCls =
    "w-full rounded-lg border border-sand-dark px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

  return (
    <form
      onSubmit={submit}
      className="w-full rounded-2xl border border-sand-dark bg-white p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">
          {t("newPlatformLocation")}
        </h3>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="rounded p-1 text-ink-faint hover:bg-sand"
          aria-label={tc("cancel")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label
            htmlFor="loc-name"
            className="mb-1 block text-xs font-medium text-ink-muted"
          >
            {t("name")}
          </label>
          <input
            id="loc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            required
            className={inputCls}
          />
          <p className="mt-0.5 text-[11px] text-ink-faint">
            Renters pick this from a dropdown, so use the name they&apos;d
            recognise.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="loc-address"
            className="mb-1 block text-xs font-medium text-ink-muted"
          >
            {t("address")}{" "}
            <span className="text-ink-faint">{t("optional")}</span>
          </label>
          <input
            id="loc-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={t("addressPlaceholder")}
            className={inputCls}
          />
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="loc-desc"
            className="mb-1 block text-xs font-medium text-ink-muted"
          >
            {t("directions")}{" "}
            <span className="text-ink-faint">{t("optional")}</span>
          </label>
          <textarea
            id="loc-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder={t("directionsPlaceholder")}
            className={inputCls}
          />
        </div>
      </div>

      {error && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={saving || name.trim().length < 2}
        className="mt-4 flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {saving ? t("creating") : t("createLocation")}
      </button>
    </form>
  );
}
