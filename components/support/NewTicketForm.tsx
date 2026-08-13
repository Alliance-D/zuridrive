"use client";

/**
 * NewTicketForm — open a support ticket.
 *
 * The form states the response target up front rather than after submitting.
 * Someone with a problem needs to know when they'll hear back BEFORE they
 * decide whether to wait or find another route.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SUPPORT_CATEGORIES } from "@/lib/support";
import { Loader2, AlertCircle, Upload, X, CheckCircle2, Zap } from "lucide-react";

const CATEGORIES = SUPPORT_CATEGORIES;

export default function NewTicketForm({
  isPriority,
  responseHours,
  planName,
}: {
  isPriority: boolean;
  responseHours: number;
  planName: string | null;
}) {
  const t = useTranslations("ticket");
  const tc = useTranslations("common");
  const te = useTranslations("enum");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("OTHER");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        if (attachments.length >= 5) break;
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folder", "bank_proofs");
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? t("uploadFailed"));
          break;
        }
        setAttachments((a) => [...a, data.url]);
      }
    } catch {
      setError(t("uploadRetry"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          category,
          message: message.trim(),
          attachments,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("openError"));
        return;
      }
      router.push(`/owner/support/${data.ticket.id}`);
      router.refresh();
    } catch {
      setError(tc("networkRetry"));
    } finally {
      setBusy(false);
    }
  }

  const ready = subject.trim().length >= 5 && message.trim().length >= 20;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-brand-dark"
      >
        {t("askForHelp")}
      </button>
    );
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-ink">
        {t("whatsTheProblem")}
      </h2>

      <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-soft">
        {isPriority && <Zap className="h-3.5 w-3.5 text-accent" />}
        {t("replyWithin", { hours: responseHours })}
        {isPriority && planName ? t("prioritySuffix", { plan: planName }) : "."}
      </p>

      <div className="mt-3 space-y-2.5">
        <div>
          <label
            htmlFor="ticket-subject"
            className="mb-1 block text-xs font-medium text-ink-muted"
          >
            {t("subject")}
          </label>
          <input
            id="ticket-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={150}
            placeholder={t("subjectPlaceholder")}
            className={input}
          />
        </div>

        <div>
          <label
            htmlFor="ticket-category"
            className="mb-1 block text-xs font-medium text-ink-muted"
          >
            {t("whatAbout")}
          </label>
          <select
            id="ticket-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={input}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {te(`ticketCategory.${c}` as never)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="ticket-message"
            className="mb-1 block text-xs font-medium text-ink-muted"
          >
            {t("details")}
          </label>
          <textarea
            id="ticket-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder={t("detailsPlaceholder")}
            className={input}
          />
          <p className="mt-1 text-[11px] text-ink-faint">
            {message.trim().length < 20
              ? t("charCount", { count: message.trim().length })
              : t("enoughToStart")}
          </p>
        </div>

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((u, i) => (
              <span
                key={u}
                className="flex items-center gap-1 rounded-full bg-bone px-2 py-0.5 text-[11px] text-ink-muted"
              >
                <CheckCircle2 className="h-3 w-3 text-success" />
                {t("fileN", { n: i + 1 })}
                <button
                  onClick={() =>
                    setAttachments((list) => list.filter((x) => x !== u))
                  }
                  aria-label={t("removeFile", { n: i + 1 })}
                  className="text-ink-faint hover:text-danger-strong"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-sand-dark px-3 py-2 text-xs font-semibold text-ink-soft hover:border-brand hover:text-brand">
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {uploading ? tc("uploading") : t("attach")}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            multiple
            onChange={upload}
            disabled={uploading || attachments.length >= 5}
            className="hidden"
          />
        </label>

        {error && (
          <div className="flex items-start gap-1.5 rounded-lg bg-danger-bg p-2">
            <AlertCircle className="mt-px h-3 w-3 shrink-0 text-danger" />
            <p className="text-[11px] text-danger">{error}</p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={submit}
            disabled={busy || !ready}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? t("sending") : t("send")}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
            disabled={busy}
            className="text-sm font-semibold text-ink-soft"
          >
            {tc("cancel")}
          </button>
        </div>
      </div>
    </section>
  );
}

const input =
  "w-full rounded-lg border border-sand-dark bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20";
