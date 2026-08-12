"use client";

/**
 * ReplyBox — add a message to an existing ticket.
 * Shared by the owner thread and the admin thread; the only difference is the
 * label, because the API decides staff-vs-user from the session, not the UI.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, Upload, X, CheckCircle2 } from "lucide-react";

export default function ReplyBox({
  ticketId,
  placeholder = "Write a reply…",
  submitLabel = "Send reply",
}: {
  ticketId: string;
  placeholder?: string;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
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
          setError(data.error ?? "Upload failed.");
          break;
        }
        setAttachments((a) => [...a, data.url]);
      }
    } catch {
      setError("Upload failed. Please retry.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim(), attachments }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We couldn't send that.");
        return;
      }
      setBody("");
      setAttachments([]);
      router.refresh();
    } catch {
      setError("Network problem. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <label htmlFor="reply-body" className="sr-only">
        Your reply
      </label>
      <textarea
        id="reply-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder={placeholder}
        className="w-full rounded-lg border border-sand-dark bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20"
      />

      {attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {attachments.map((u, i) => (
            <span
              key={u}
              className="flex items-center gap-1 rounded-full bg-bone px-2 py-0.5 text-[11px] text-ink-muted"
            >
              <CheckCircle2 className="h-3 w-3 text-success" />
              File {i + 1}
              <button
                onClick={() =>
                  setAttachments((list) => list.filter((x) => x !== u))
                }
                aria-label={`Remove file ${i + 1}`}
                className="text-ink-faint hover:text-danger-strong"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-danger-bg p-2">
          <AlertCircle className="mt-px h-3 w-3 shrink-0 text-danger" />
          <p className="text-[11px] text-danger">{error}</p>
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={send}
          disabled={busy || body.trim().length < 2}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? "Sending…" : submitLabel}
        </button>

        <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink-soft hover:text-brand">
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {uploading ? "Uploading…" : "Attach"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            multiple
            onChange={upload}
            disabled={uploading || attachments.length >= 5}
            className="hidden"
          />
        </label>
      </div>
    </div>
  );
}
