"use client";

/**
 * Set or change the account password.
 *
 * Two states, because two kinds of account exist. Anyone who registered before
 * signup asked for a password — and anyone whose account was created for them
 * by a guest booking — has none, so there is nothing for them to confirm and
 * the form says "set" rather than "change". Everyone else has to prove the
 * current one first, otherwise an unattended signed-in phone is a permanent
 * takeover.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Lock, Loader2, Check, AlertCircle, Eye, EyeOff } from "lucide-react";

export default function PasswordSection({
  hasPassword,
}: {
  hasPassword: boolean;
}) {
  const t = useTranslations("dashboard");
  const ta = useTranslations("auth");

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setDone(false);

    // Checked here so an obvious slip costs nothing to discover.
    if (next.length < 8) {
      setError(ta("passwordTooShort"));
      return;
    }
    if (next !== confirm) {
      setError(ta("passwordsDontMatch"));
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/me/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPassword: next,
          ...(hasPassword ? { currentPassword: current } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? t("couldntSave"));
        return;
      }
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch {
      setError(t("couldntSave"));
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-sand-dark bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand";

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-sand-dark">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
        <Lock className="h-4 w-4 text-ink-faint" />
        {hasPassword ? t("changePassword") : t("setPassword")}
      </h3>
      <p className="mb-4 text-xs text-ink-soft">
        {hasPassword ? t("changePasswordHint") : t("setPasswordHint")}
      </p>

      <div className="grid gap-3 sm:max-w-sm">
        {hasPassword && (
          <div>
            <label
              htmlFor="current-password"
              className="mb-1 block text-xs font-semibold text-ink-soft"
            >
              {t("currentPassword")}
            </label>
            <input
              id="current-password"
              type={show ? "text" : "password"}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              className={field}
            />
          </div>
        )}

        <div>
          <label
            htmlFor="new-password"
            className="mb-1 block text-xs font-semibold text-ink-soft"
          >
            {hasPassword ? t("newPassword") : ta("password")}
          </label>
          <div className="relative">
            <input
              id="new-password"
              aria-describedby="new-password-hint"
              type={show ? "text" : "password"}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              className={`${field} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? ta("hidePassword") : ta("showPassword")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
            >
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <p id="new-password-hint" className="mt-1 text-[11px] text-ink-faint">
            {ta("passwordHint")}
          </p>
        </div>

        <div>
          <label
            htmlFor="confirm-password"
            className="mb-1 block text-xs font-semibold text-ink-soft"
          >
            {ta("confirmPassword")}
          </label>
          <input
            id="confirm-password"
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className={field}
          />
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-danger-error">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={busy}
            className="flex items-center gap-2 self-start rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {hasPassword ? t("changePassword") : t("setPassword")}
          </button>
          {done && (
            <span className="flex items-center gap-1.5 text-xs text-success-strong">
              <Check className="h-3.5 w-3.5" /> {t("passwordUpdated")}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
