"use client";

/**
 * LocationManager — add and remove a listing's pickup points.
 *
 * Previously these could only be created inside the create-a-car wizard, so an
 * owner who moved, or who wanted a second handover point, had no way to change
 * them. The owner locations page just said "list a car to add one".
 *
 * New points show as "Awaiting approval" until a moderator clears them. Saying
 * so plainly avoids the obvious support question — the owner adds a pickup
 * point, doesn't see it offered to renters, and assumes it failed.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { MapPin, Loader2, Trash2, Plus, X, AlertCircle } from "lucide-react";

export interface OwnerLocationItem {
  id: string;
  name: string;
  description: string | null;
  isApproved: boolean;
}

const MAX_LOCATIONS = 6;

export default function LocationManager({
  carId,
  initial,
}: {
  carId: string;
  initial: OwnerLocationItem[];
}) {
  const t = useTranslations("carForm");
  const tc = useTranslations("common");
  const router = useRouter();
  const [locations, setLocations] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cars/${carId}/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We couldn't add that pickup point.");
        return;
      }
      setLocations((l) => [...l, data.location]);
      setName("");
      setDescription("");
      setAdding(false);
      router.refresh();
    } catch {
      setError(tc("networkRetry"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/cars/${carId}/locations?locationId=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We couldn't remove that pickup point.");
        return;
      }
      setLocations((l) => l.filter((x) => x.id !== id));
      router.refresh();
    } catch {
      setError(tc("networkRetry"));
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-sand-dark px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <MapPin className="h-4 w-4 text-brand" />
        <h2 className="text-sm font-semibold text-ink">
          Pickup points ({locations.length}/{MAX_LOCATIONS})
        </h2>
      </div>
      <p className="mb-4 text-xs text-ink-soft">
        Where renters can collect this car. New points are checked by our team
        before renters see them.
      </p>

      {locations.length > 0 ? (
        <ul className="space-y-2">
          {locations.map((loc) => (
            <li
              key={loc.id}
              className="flex items-start justify-between gap-3 rounded-lg bg-bone px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  {loc.name}
                </p>
                {loc.description && (
                  <p className="truncate text-xs text-ink-soft">
                    {loc.description}
                  </p>
                )}
                {!loc.isApproved && (
                  <span className="mt-1 inline-block rounded-full bg-warning-tint px-2 py-0.5 text-[10px] font-semibold text-warning-dark">
                    {t("awaitingApproval")}
                  </span>
                )}
              </div>
              <button
                onClick={() => remove(loc.id)}
                disabled={busy}
                aria-label={`Remove ${loc.name}`}
                className="shrink-0 rounded p-1.5 text-ink-faint hover:bg-danger-bg hover:text-danger disabled:opacity-30"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg bg-warning-tint px-3 py-2 text-xs text-warning-dark">
          No pickup points yet. Renters need somewhere to collect the car unless
          you deliver anywhere.
        </p>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      {adding ? (
        <form onSubmit={add} className="mt-4 rounded-lg border border-sand-dark p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-ink">{t("newPickupPoint")}</p>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              className="rounded p-1 text-ink-faint hover:bg-sand"
              aria-label={tc("cancel")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <label htmlFor={`${carId}-loc-name`} className="mb-1 block text-xs text-ink-muted">
            {t("name")}
          </label>
          <input
            id={`${carId}-loc-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("pickupNamePlaceholder")}
            required
            className={inputCls}
          />

          <label
            htmlFor={`${carId}-loc-desc`}
            className="mb-1 mt-2 block text-xs text-ink-muted"
          >
            {t("directions")} <span className="text-ink-faint">(optional)</span>
          </label>
          <input
            id={`${carId}-loc-desc`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("pickupDirectionsPlaceholder")}
            className={inputCls}
          />

          <button
            type="submit"
            disabled={busy || name.trim().length < 2}
            className="mt-3 flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Adding…" : "Add pickup point"}
          </button>
        </form>
      ) : (
        locations.length < MAX_LOCATIONS && (
          <button
            onClick={() => setAdding(true)}
            className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
          >
            <Plus className="h-4 w-4" />
            {t("addPickupPoint")}
          </button>
        )
      )}
    </section>
  );
}
