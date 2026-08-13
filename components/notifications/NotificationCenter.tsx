"use client";

/**
 * NotificationCenter — shared by the client and owner dashboards.
 *
 * Clicking a notification marks it read and follows its actionUrl, so the
 * common case (see it → act on it) is one tap rather than two.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import type { NotificationType } from "@prisma/client";
import { formatDate } from "@/lib/dates";
import {
  Bell,
  Check,
  CheckCheck,
  CalendarDays,
  Wallet,
  Scale,
  Star,
  ShieldCheck,
  Camera,
  Megaphone,
  Loader2,
} from "lucide-react";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  actionUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

/** Which icon fits which notification family. */
function iconFor(type: NotificationType) {
  if (type.startsWith("BOOKING") || type.startsWith("TRIP") || type === "RETURN_CONFIRMED")
    return CalendarDays;
  if (type.startsWith("PAYMENT") || type.startsWith("PAYOUT") || type.startsWith("BANK"))
    return Wallet;
  if (type.startsWith("DEPOSIT")) return ShieldCheck;
  if (type.startsWith("DISPUTE")) return Scale;
  if (type.startsWith("REVIEW")) return Star;
  if (type.includes("PHOTO")) return Camera;
  return Megaphone;
}

/**
 * Relative time. The translator and locale are passed in because this is a
 * module-level function — there is no hook context here, and hard-coding the
 * strings would leave "3d ago" in English on an otherwise translated page.
 */
function timeAgo(
  iso: string,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
  locale: string,
) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("justNow");
  if (mins < 60) return t("minutesAgo", { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("hoursAgo", { count: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 30) return t("daysAgo", { count: days });
  return formatDate(iso, locale);
}

export default function NotificationCenter({
  initial,
  unreadCount,
}: {
  initial: NotificationItem[];
  unreadCount: number;
}) {
  const t = useTranslations("notificationCentre");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [unread, setUnread] = useState(unreadCount);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [busy, setBusy] = useState(false);

  const shown = filter === "unread" ? items.filter((n) => !n.isRead) : items;

  async function markRead(id: string) {
    // Optimistic — the row is already visibly read to the user.
    setItems((list) =>
      list.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
    setUnread((u) => Math.max(0, u - 1));

    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_read", id }),
    }).catch(() => {});

    router.refresh();
  }

  async function markAllRead() {
    setBusy(true);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      });
      setItems((list) => list.map((n) => ({ ...n, isRead: true })));
      setUnread(0);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              filter === "all"
                ? "bg-brand text-white"
                : "bg-white text-ink-soft hover:text-ink"
            }`}
          >
            {tc("all")}
          </button>
          <button
            onClick={() => setFilter("unread")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
              filter === "unread"
                ? "bg-brand text-white"
                : "bg-white text-ink-soft hover:text-ink"
            }`}
          >
            {t("unread")}
            {unread > 0 && (
              <span
                className={`rounded-full px-1.5 text-[10px] ${
                  filter === "unread"
                    ? "bg-white/20"
                    : "bg-accent text-white"
                }`}
              >
                {unread}
              </span>
            )}
          </button>
        </div>

        {unread > 0 && (
          <button
            onClick={markAllRead}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCheck className="h-3 w-3" />
            )}
            {t("markAllRead")}
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sand">
            <Bell className="h-5 w-5 text-ink-faint" />
          </div>
          <h2 className="text-base font-semibold text-ink">
            {filter === "unread" ? t("nothingUnread") : t("noneYet")}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {filter === "unread"
              ? t("allCaughtUp")
              : t("updatesAppearHere")}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {shown.map((n) => {
            const Icon = iconFor(n.type);
            const inner = (
              <div
                className={`flex items-start gap-3 rounded-2xl p-4 shadow-sm transition-colors ${
                  n.isRead ? "bg-white" : "bg-warning-bg"
                }`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    n.isRead ? "bg-sand" : "bg-accent"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${n.isRead ? "text-ink-soft" : "text-white"}`}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={`text-sm ${
                        n.isRead
                          ? "font-medium text-ink-muted"
                          : "font-semibold text-ink"
                      }`}
                    >
                      {n.title}
                    </p>
                    <span className="shrink-0 text-[11px] text-ink-faint">
                      {timeAgo(n.createdAt, t, locale)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-soft">{n.body}</p>
                </div>

                {!n.isRead && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      markRead(n.id);
                    }}
                    aria-label={t("markAsRead")}
                    className="shrink-0 rounded-full p-1 text-ink-faint hover:bg-white hover:text-brand"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );

            return (
              <li key={n.id}>
                {n.actionUrl ? (
                  <Link
                    href={n.actionUrl}
                    onClick={() => !n.isRead && markRead(n.id)}
                    className="block hover:opacity-90"
                  >
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
