"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Reply, AlertCircle } from "lucide-react";

/**
 * Posts a one-time reply to a review. The API rejects a second reply, so the
 * form disappears on success rather than staying open.
 */
export default function ReviewReplyForm({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (text.trim().length === 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: text.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "We couldn’t post your reply.");
        return;
      }

      setOpen(false);
      setText("");
      router.refresh();
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
      >
        <Reply className="h-3 w-3" />
        Reply to this review
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={2000}
        autoFocus
        placeholder="Thanks for renting with us…"
        className="w-full rounded-lg border border-sand-dark px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20"
      />

      {error && (
        <div className="flex items-start gap-1.5 rounded-lg bg-danger-bg p-2">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-danger" />
          <p className="text-xs text-danger">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={submitting || text.trim().length === 0}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
          {submitting ? "Posting…" : "Post reply"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={submitting}
          className="text-xs font-semibold text-ink-soft hover:text-ink"
        >
          Cancel
        </button>
        <span className="ml-auto text-[10px] text-ink-faint">
          Replies are public and can only be posted once.
        </span>
      </div>
    </div>
  );
}
