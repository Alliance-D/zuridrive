"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Loader2, Plus, AlertCircle, MapPin } from "lucide-react";

export interface NeighborhoodItem {
  id: string;
  name: string;
  city: string;
  isActive: boolean;
  locationCount: number;
}

export default function NeighborhoodManager({
  items,
}: {
  items: NeighborhoodItem[];
}) {
  const t = useTranslations("adminActions");
  const tc = useTranslations("common");
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (name.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/neighborhoods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), city: "Kigali" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("couldNotAdd"));
        return;
      }
      setName("");
      router.refresh();
    } catch {
      setError(tc("networkRetry"));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string, isActive: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/neighborhoods", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? t("couldNotUpdate"));
        return;
      }
      router.refresh();
    } catch {
      setError(tc("networkRetry"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={t("addNeighbourhood")}
          className="flex-1 rounded-lg border border-sand-dark bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        <button
          onClick={add}
          disabled={busy || name.trim().length < 2}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Add
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-danger-bg p-2.5">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-danger" />
          <p className="text-xs text-danger">{error}</p>
        </div>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl bg-bone px-4 py-8 text-center text-sm text-ink-soft">
          No neighbourhoods yet. Owners pick from this list when adding a pickup
          point.
        </p>
      ) : (
        <ul className="divide-y divide-sand">
          {items.map((n) => (
            <li key={n.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <MapPin
                  className={`h-3.5 w-3.5 shrink-0 ${n.isActive ? "text-brand" : "text-ink-faint"}`}
                />
                <span
                  className={`text-sm ${n.isActive ? "font-medium text-ink" : "text-ink-faint line-through"}`}
                >
                  {n.name}
                </span>
                <span className="text-[11px] text-ink-faint">
                  {n.city} · {n.locationCount} pickup point
                  {n.locationCount === 1 ? "" : "s"}
                </span>
              </div>

              <button
                onClick={() => toggle(n.id, !n.isActive)}
                disabled={busy}
                className="shrink-0 rounded-lg border border-sand-dark px-2.5 py-1 text-[11px] font-semibold text-ink-muted hover:border-brand disabled:opacity-50"
              >
                {n.isActive ? t("deactivate") : t("activate")}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-ink-faint">
        Neighbourhoods can&apos;t be deleted — one may already be attached to a
        pickup point. Deactivating hides it from new selections and leaves
        existing ones working.
      </p>
    </div>
  );
}
