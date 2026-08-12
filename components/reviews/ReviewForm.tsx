"use client";

/**
 * ReviewForm — four-category trip review.
 *
 * The overall rating is derived from the four categories rather than entered
 * separately, so it can never contradict them. The server recomputes it —
 * this is only a preview.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star, Loader2, AlertCircle } from "lucide-react";

const CATEGORIES = [
  {
    id: "cleanlinessRating",
    label: "Cleanliness",
    hint: "How clean was the car when you collected it?",
  },
  {
    id: "comfortRating",
    label: "Comfort",
    hint: "How comfortable was the drive?",
  },
  {
    id: "valueRating",
    label: "Value for money",
    hint: "Was it worth what you paid?",
  },
  {
    id: "communicationRating",
    label: "Communication",
    hint: "How easy was the owner to deal with?",
  },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

export default function ReviewForm({
  bookingId,
  carName,
}: {
  bookingId: string;
  carName: string;
}) {
  const router = useRouter();
  const [ratings, setRatings] = useState<Partial<Record<CategoryId, number>>>({});
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allRated = CATEGORIES.every((c) => ratings[c.id]);
  const values = Object.values(ratings).filter(Boolean) as number[];
  const overall =
    values.length === CATEGORIES.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : null;

  async function submit() {
    if (!allRated) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          cleanlinessRating: ratings.cleanlinessRating,
          comfortRating: ratings.comfortRating,
          valueRating: ratings.valueRating,
          communicationRating: ratings.communicationRating,
          comment: comment.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We couldn't save your review.");
        return;
      }
      router.push(`/dashboard/bookings/${bookingId}`);
      router.refresh();
    } catch {
      setError("Network problem. Please check your connection and retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-ink">
          How was the {carName}?
        </h2>
        <p className="mt-0.5 text-xs text-ink-soft">
          Your review helps other renters choose. It&apos;s public, and the owner
          can reply once.
        </p>

        <div className="mt-4 space-y-4">
          {CATEGORIES.map((c) => (
            <div key={c.id}>
              <div className="flex items-baseline justify-between gap-2">
                <label className="text-sm font-medium text-ink">
                  {c.label}
                </label>
                {ratings[c.id] && (
                  <span className="text-xs text-ink-soft">
                    {ratings[c.id]} / 5
                  </span>
                )}
              </div>
              <p className="mb-1.5 text-[11px] text-ink-faint">{c.hint}</p>
              <StarPicker
                value={ratings[c.id] ?? 0}
                onChange={(v) => setRatings((r) => ({ ...r, [c.id]: v }))}
              />
            </div>
          ))}
        </div>

        {overall !== null && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-bone px-3 py-2">
            <span className="text-xs text-ink-soft">Overall</span>
            <span className="text-lg font-bold text-brand">
              {overall.toFixed(2)}
            </span>
            <span className="text-[11px] text-ink-faint">
              averaged from your four ratings
            </span>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <label className="mb-1 block text-sm font-medium text-ink">
          Anything else? (optional)
        </label>
        <p className="mb-2 text-[11px] text-ink-faint">
          What would you tell a friend about this car and owner?
        </p>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="The car was spotless and the owner met me right on time…"
          className="w-full rounded-lg border border-sand-dark px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        <p className="mt-1 text-right text-[11px] text-ink-faint">
          {comment.length}/2000
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-danger-bg p-3">
          <AlertCircle className="mt-px h-4 w-4 shrink-0 text-danger" />
          <p className="text-xs text-danger">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={!allRated || busy}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? "Posting…" : "Post review"}
        </button>
        {!allRated && (
          <p className="text-xs text-ink-faint">
            Rate all four categories to continue.
          </p>
        )}
      </div>
    </div>
  );
}

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
          className="rounded p-0.5 transition-transform hover:scale-110"
        >
          <Star
            className={`h-6 w-6 ${
              star <= shown
                ? "fill-accent text-accent"
                : "text-sand-dark"
            }`}
          />
        </button>
      ))}
    </div>
  );
}
