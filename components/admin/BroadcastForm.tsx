"use client";

/**
 * BroadcastForm — send an announcement.
 *
 * Sending needs a two-step confirm because it reaches real phones and costs
 * money per SMS. The recipient count is shown before the confirm and sent back
 * with the request; if the audience shifted in between, the server rejects it.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  Loader2,
  AlertCircle,
  Send,
  Users,
  Smartphone,
  Bell,
  CheckCircle2,
} from "lucide-react";

type Audience = "ALL" | "CLIENTS" | "OWNERS" | "ACTIVE_OWNERS";
type Channel = "IN_APP" | "SMS" | "BOTH";

// Keys, not text — module scope has no translator.
const AUDIENCES: { id: Audience; labelKey: string; descKey: string }[] = [
  { id: "ALL", labelKey: "audienceEveryone", descKey: "audEveryoneDesc" },
  { id: "CLIENTS", labelKey: "audienceClients", descKey: "audClientsDesc" },
  { id: "OWNERS", labelKey: "audienceOwners", descKey: "audOwnersDesc" },
  {
    id: "ACTIVE_OWNERS",
    labelKey: "audienceActiveOwners",
    descKey: "audActiveOwnersDesc",
  },
];

/** Africa's Talking bills per 160 characters. */
const SMS_SEGMENT = 160;

export default function BroadcastForm({
  audienceSizes,
}: {
  audienceSizes: Record<string, number>;
}) {
  const t = useTranslations("adminForms");
  const tc = useTranslations("common");
  const router = useRouter();
  const [audience, setAudience] = useState<Audience>("ALL");
  const [channel, setChannel] = useState<Channel>("IN_APP");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    recipients: number;
    inAppSent: number;
    smsSent: number;
    smsFailed: number;
  } | null>(null);

  const count = audienceSizes[audience] ?? 0;
  const sendsSms = channel === "SMS" || channel === "BOTH";
  const segments = Math.max(1, Math.ceil((body.length + 12) / SMS_SEGMENT));
  const canSend = title.trim().length >= 3 && body.trim().length >= 10 && count > 0;

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience,
          channel,
          title: title.trim(),
          body: body.trim(),
          confirmRecipientCount: count,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("broadcastFailed"));
        setConfirming(false);
        return;
      }
      setResult(data);
      setTitle("");
      setBody("");
      setConfirming(false);
      router.refresh();
    } catch {
      setError(tc("networkRetry"));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg">
          <CheckCircle2 className="h-5 w-5 text-success" />
        </div>
        <h2 className="text-base font-semibold text-ink">{t("broadcastSent")}</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Reached {result.recipients} people.
        </p>
        <dl className="mx-auto mt-3 flex max-w-xs justify-center gap-4 text-xs">
          <div>
            <dt className="text-ink-faint">{t("inApp")}</dt>
            <dd className="font-semibold text-ink">{result.inAppSent}</dd>
          </div>
          <div>
            <dt className="text-ink-faint">{t("smsSent")}</dt>
            <dd className="font-semibold text-ink">{result.smsSent}</dd>
          </div>
          {result.smsFailed > 0 && (
            <div>
              <dt className="text-ink-faint">{t("smsFailed")}</dt>
              <dd className="font-semibold text-danger-strong">{result.smsFailed}</dd>
            </div>
          )}
        </dl>
        <button
          onClick={() => setResult(null)}
          className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          {t("sendAnother")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Users className="h-4 w-4" />
          {t("whoGetsThis")}
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {AUDIENCES.map((a) => {
            const on = audience === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setAudience(a.id)}
                className={`flex items-start justify-between gap-2 rounded-xl border-2 p-3 text-left ${
                  on
                    ? "border-brand bg-brand/5"
                    : "border-sand-dark hover:border-ink-faint"
                }`}
              >
                <span className="min-w-0">
                  <span
                    className={`block text-sm font-semibold ${on ? "text-brand" : "text-ink"}`}
                  >
                    {t(a.labelKey)}
                  </span>
                  <span className="block text-[11px] text-ink-soft">
                    {t(a.descKey)}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-sand px-2 py-0.5 text-[11px] font-bold text-ink-muted">
                  {audienceSizes[a.id] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-ink">How?</h2>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { id: "IN_APP", labelKey: "channelInApp", icon: Bell },
              { id: "SMS", labelKey: "channelSms", icon: Smartphone },
              { id: "BOTH", labelKey: "channelBoth", icon: Send },
            ] as const
          ).map((c) => {
            const Icon = c.icon;
            const on = channel === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setChannel(c.id)}
                className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 ${
                  on
                    ? "border-brand bg-brand/5"
                    : "border-sand-dark hover:border-ink-faint"
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${on ? "text-brand" : "text-ink-faint"}`}
                />
                <span
                  className={`text-xs font-semibold ${on ? "text-brand" : "text-ink-muted"}`}
                >
                  {t(c.labelKey)}
                </span>
              </button>
            );
          })}
        </div>

        {sendsSms && (
          <p className="mt-2 rounded-lg bg-warning-bg px-3 py-2 text-[11px] text-warning">
            SMS costs money per message. This will send roughly{" "}
            <strong>
              {count * segments} segment{count * segments === 1 ? "" : "s"}
            </strong>{" "}
            ({count} recipients × {segments} per message).
          </p>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-ink">Message</h2>

        <label className="mb-1 block text-xs font-medium text-ink-muted">
          {t("title")}{" "}
          <span className="text-ink-faint">{t("titleInAppOnly")}</span>
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder={t("titlePlaceholder")}
          className="mb-3 w-full rounded-lg border border-sand-dark px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
        />

        <label className="mb-1 block text-xs font-medium text-ink-muted">
          {t("message")}
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={700}
          placeholder={t("messagePlaceholder")}
          className="w-full rounded-lg border border-sand-dark px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        <div className="mt-1 flex justify-between text-[11px] text-ink-faint">
          <span>
            {sendsSms &&
              `${segments} SMS segment${segments === 1 ? "" : "s"} per person`}
          </span>
          <span>{body.length}/700</span>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-danger-bg p-3">
          <AlertCircle className="mt-px h-4 w-4 shrink-0 text-danger" />
          <p className="text-xs text-danger">{error}</p>
        </div>
      )}

      {confirming ? (
        <div className="rounded-2xl border-2 border-accent bg-warning-bg p-4">
          <p className="text-sm font-semibold text-warning">
            Send to {count} {count === 1 ? "person" : "people"}?
          </p>
          <p className="mt-0.5 text-xs text-warning">
            {channel === "IN_APP"
              ? "They'll see it in their notification centre."
              : channel === "SMS"
                ? "This sends real text messages and costs money."
                : "This sends real text messages and costs money, plus an in-app notification."}{" "}
            It can&apos;t be recalled.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={send}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Sending…" : `Yes, send to ${count}`}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-warning"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          disabled={!canSend}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {t("reviewAndSend")}
        </button>
      )}
    </div>
  );
}
