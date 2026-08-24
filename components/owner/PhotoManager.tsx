"use client";

/**
 * PhotoManager — add, remove and reorder a listing's photos.
 *
 * Replaces a read-only grid. The first photo is the cover, and there was no way
 * to change which one that was — whichever image happened to be uploaded first
 * during the create wizard was the cover forever.
 *
 * Reordering is move-left / move-right rather than drag-and-drop. Drag is
 * fiddly on a phone, invisible to a keyboard, and this list is at most ten
 * items; buttons work everywhere and need no explanation.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  Camera,
  Loader2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Upload,
  AlertCircle,
} from "lucide-react";

export interface CarPhoto {
  id: string;
  url: string;
  order: number;
}

const MAX_PHOTOS = 10;

export default function PhotoManager({
  carId,
  initial,
}: {
  carId: string;
  initial: CarPhoto[];
}) {
  const t = useTranslations("carForm");
  const tc = useTranslations("common");
  const router = useRouter();
  const [photos, setPhotos] = useState<CarPhoto[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError(t("photosUnder5mb"));
      e.target.value = "";
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "car_photos");

      const up = await fetch("/api/upload", { method: "POST", body: fd });
      const upData = await up.json();
      if (!up.ok) {
        setError(upData.error ?? t("uploadFailed"));
        return;
      }

      const res = await fetch(`/api/cars/${carId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: upData.url, publicId: upData.publicId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We couldn't add that photo.");
        return;
      }

      setPhotos((p) => [...p, data.photo]);
      router.refresh();
    } catch {
      setError(tc("networkRetry"));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function remove(photoId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/cars/${carId}/photos?photoId=${encodeURIComponent(photoId)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We couldn't remove that photo.");
        return;
      }
      setPhotos((p) => p.filter((x) => x.id !== photoId));
      router.refresh();
    } catch {
      setError(tc("networkRetry"));
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;

    const next = [...photos];
    [next[index], next[target]] = [next[target], next[index]];
    setPhotos(next); // optimistic — the order is obvious and instantly visible

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cars/${carId}/photos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: next.map((p) => p.id) }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "We couldn't save that order.");
        setPhotos(photos); // put it back
        return;
      }
      router.refresh();
    } catch {
      setError(tc("networkRetry"));
      setPhotos(photos);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <Camera className="h-4 w-4 text-brand" />
        <h2 className="text-sm font-semibold text-ink">
          Photos ({photos.length}/{MAX_PHOTOS})
        </h2>
      </div>
      <p className="mb-4 text-xs text-ink-soft">
        The first photo is what renters see in search results. Put your best one
        first.
      </p>

      {photos.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.map((photo, i) => (
            <li key={photo.id} className="group relative">
              <div className="relative aspect-video overflow-hidden rounded-lg bg-sand ring-1 ring-sand-dark">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={i === 0 ? "Cover photo" : `Photo ${i + 1}`}
                  className="h-full w-full object-cover"
                />
                {i === 0 && (
                  <span className="absolute left-1 top-1 rounded bg-brand px-1.5 py-0.5 text-[9px] font-bold text-white">
                    {t("cover")}
                  </span>
                )}
              </div>

              <div className="mt-1 flex items-center justify-between gap-1">
                <div className="flex gap-0.5">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={busy || i === 0}
                    aria-label={`Move photo ${i + 1} earlier`}
                    className="rounded p-1 text-ink-soft hover:bg-sand disabled:opacity-30"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={busy || i === photos.length - 1}
                    aria-label={`Move photo ${i + 1} later`}
                    className="rounded p-1 text-ink-soft hover:bg-sand disabled:opacity-30"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <button
                  onClick={() => remove(photo.id)}
                  disabled={busy}
                  aria-label={`Remove photo ${i + 1}`}
                  className="rounded p-1 text-ink-faint hover:bg-danger-bg hover:text-danger disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg bg-warning-tint px-3 py-2 text-xs text-warning-dark">
          {t("noPhotosYet")}
        </p>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      {photos.length < MAX_PHOTOS && (
        <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-sand-darker py-4 text-sm text-ink-faint transition-colors hover:border-brand hover:text-brand">
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Working…
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" /> {t("addAPhoto")}
            </>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={upload}
            disabled={busy}
            className="hidden"
          />
        </label>
      )}
    </section>
  );
}
