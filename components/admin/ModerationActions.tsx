"use client";

/**
 * ModerationActions — generic action buttons for admin list rows.
 *
 * Used for both cars and users. Actions that need a written reason open an
 * inline prompt rather than a modal, so a whole list can be worked through
 * without losing your place.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";

export interface ModerationAction {
  /** Sent as `action` in the request body. */
  id: string;
  label: string;
  /** Prompts for a reason before firing. */
  needsReason?: boolean;
  reasonPlaceholder?: string;
  tone?: "default" | "primary" | "danger" | "warn";
  /** Extra confirmation copy shown above the reason box. */
  warning?: string;
}

const TONES = {
  default: "border border-sand-dark text-ink-muted hover:border-brand hover:text-brand",
  primary: "bg-brand text-white hover:bg-brand-dark",
  danger: "border border-danger-soft text-danger-strong hover:bg-danger-tint",
  warn: "border border-accent-pale text-warning-dark hover:bg-warning-pale",
} as const;

export default function ModerationActions({
  endpoint,
  actions,
  method = "POST",
  extraBody,
}: {
  /** Request target, e.g. /api/admin/cars/abc123 */
  endpoint: string;
  actions: ModerationAction[];
  /** Some endpoints act on a collection and take the id in the body. */
  method?: "POST" | "PATCH";
  /** Merged into every request body — e.g. { id } for collection endpoints. */
  extraBody?: Record<string, unknown>;
}) {
  const router = useRouter();
  const [active, setActive] = useState<ModerationAction | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fire(action: ModerationAction, withReason?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...extraBody,
          action: action.id,
          ...(withReason ? { reason: withReason } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Action failed.");
        return;
      }
      setActive(null);
      setReason("");
      router.refresh();
    } catch {
      setError("Network problem. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  if (active?.needsReason) {
    return (
      <div className="w-full max-w-md space-y-2">
        {active.warning && (
          <p className="rounded-lg bg-warning-tint px-2.5 py-1.5 text-[11px] text-warning-dark">
            {active.warning}
          </p>
        )}
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={active.reasonPlaceholder ?? "Reason (shown to the user)"}
          autoFocus
          className="w-full rounded-lg border border-sand-dark px-2.5 py-1.5 text-xs"
        />
        {error && (
          <div className="flex items-start gap-1.5 rounded-lg bg-danger-bg p-2">
            <AlertCircle className="mt-px h-3 w-3 shrink-0 text-danger" />
            <p className="text-[11px] text-danger">{error}</p>
          </div>
        )}
        <div className="flex gap-1.5">
          <button
            onClick={() => fire(active, reason.trim())}
            disabled={busy || reason.trim().length < 10}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50 ${
              active.tone === "danger"
                ? "bg-danger-strong text-white"
                : "bg-brand text-white"
            }`}
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            Confirm {active.label.toLowerCase()}
          </button>
          <button
            onClick={() => {
              setActive(null);
              setReason("");
              setError(null);
            }}
            disabled={busy}
            className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-ink-soft"
          >
            Cancel
          </button>
        </div>
        <p className="text-[10px] text-ink-faint">
          {reason.trim().length < 10
            ? `At least 10 characters (${reason.trim().length}/10).`
            : "This is recorded in the audit log."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {actions.map((a) => (
        <button
          key={a.id}
          onClick={() => (a.needsReason ? setActive(a) : fire(a))}
          disabled={busy}
          className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50 ${
            TONES[a.tone ?? "default"]
          }`}
        >
          {busy && !a.needsReason ? "…" : a.label}
        </button>
      ))}
      {error && <span className="text-[11px] text-danger-strong">{error}</span>}
    </div>
  );
}
