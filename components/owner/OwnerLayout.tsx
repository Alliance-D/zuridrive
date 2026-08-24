"use client";

/**
 * OwnerLayout — the owner workspace shell.
 *
 * A LEFT SIDEBAR, not horizontal tabs. This used to be a row of ten tabs
 * across the top, which is roughly twice what that pattern carries before it
 * wraps or scrolls, and it did not match the admin area — which already used a
 * sidebar, so the two halves of the same product disagreed with each other.
 *
 * A dashboard is somewhere people work rather than a page they read: the
 * navigation should stay put, scale down the list rather than along it, and
 * keep the current section obvious. It collapses to icons for anyone who wants
 * the width back, and the choice is remembered.
 *
 * It also carries a "Back to ZuriDrive" link. The owner area had no route home
 * at all — once inside, the only way back to the public site was the browser's
 * back button.
 *
 * Owners who have not finished onboarding get a persistent banner pointing back
 * to /owner/onboarding rather than being hard-redirected — they can still look
 * around while they finish setting up.
 */

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Car,
  CalendarDays,
  Wallet,
  Banknote,
  BarChart3,
  Star,
  MapPin,
  LifeBuoy,
  User,
  Bell,
  LogOut,
  Menu,
  X,
  AlertCircle,
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

const TABS = [
  { labelKey: "overview", href: "/owner/dashboard", icon: LayoutDashboard },
  { labelKey: "fleet", href: "/owner/fleet", icon: Car },
  { labelKey: "bookings", href: "/owner/bookings", icon: CalendarDays },
  { labelKey: "earnings", href: "/owner/earnings", icon: Wallet },
  { labelKey: "payouts", href: "/owner/payouts", icon: Banknote },
  { labelKey: "analytics", href: "/owner/analytics", icon: BarChart3 },
  { labelKey: "reviews", href: "/owner/reviews", icon: Star },
  { labelKey: "locations", href: "/owner/locations", icon: MapPin },
  { labelKey: "support", href: "/owner/support", icon: LifeBuoy },
  { labelKey: "profile", href: "/owner/profile", icon: User },
];

const COLLAPSE_KEY = "zuridrive.owner.navCollapsed";

interface OwnerLayoutProps {
  children: React.ReactNode;
  notificationCount?: number;
  isOnboardingComplete?: boolean;
}

export default function OwnerLayout({
  children,
  notificationCount = 0,
  isOnboardingComplete = true,
}: OwnerLayoutProps) {
  const t = useTranslations("owner");
  const pathname = usePathname();
  const { data: session } = useSession();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Read the stored preference after mount. Reading it during render would
  // make the server and client disagree and throw a hydration error.
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      window.localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      return !c;
    });
  }

  // Longest matching href wins, so /owner/fleet/new highlights "Fleet".
  const active =
    [...TABS].reverse().find((t) => pathname.startsWith(t.href))?.href ??
    "/owner/dashboard";

  const userName = session?.user?.name ?? "Owner";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="min-h-screen bg-bone font-sans">
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-sand-dark bg-white">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileOpen((o) => !o)}
              className="rounded-lg p-1.5 text-ink-muted hover:bg-sand lg:hidden"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <Link href="/owner/dashboard" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand">
                <Car className="h-4 w-4 text-accent" />
              </div>
              <div className="leading-tight">
                <p className="font-display text-lg font-semibold leading-[1.15] tracking-[-0.02em] text-brand">Zuri<span className="text-accent">Drive</span></p>
                <p className="text-[10px] uppercase tracking-wider text-ink-soft">
                  {t("owner")}
                </p>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-1">
            <Link
              href="/owner/notifications"
              className="relative rounded-lg p-2 text-ink-muted hover:bg-sand"
              aria-label={`Notifications${notificationCount ? `, ${notificationCount} unread` : ""}`}
            >
              <Bell className="h-4 w-4" />
              {notificationCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                  {notificationCount > 9 ? "9+" : notificationCount}
                </span>
              )}
            </Link>

            <span
              className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-bold text-white"
              title={userName}
            >
              {initials}
            </span>

            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="rounded-lg p-2 text-ink-muted hover:bg-sand hover:text-danger"
              aria-label={t("signOut")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {!isOnboardingComplete && (
        <div className="flex items-start gap-2 border-b border-warning-tint bg-warning-bg px-4 py-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" />
          <p className="text-xs text-warning-dark">
            Your profile isn&apos;t finished yet.{" "}
            <Link href="/owner/onboarding" className="font-semibold underline">
              {t("completeOnboarding")}
            </Link>{" "}
            so renters can find and contact you.
          </p>
        </div>
      )}

      <div className="flex">
        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside
          className={`${mobileOpen ? "block" : "hidden"} fixed inset-x-0 top-[53px] z-30 border-b border-sand-dark bg-white lg:sticky lg:top-[53px] lg:block lg:h-[calc(100vh-53px)] lg:shrink-0 lg:border-b-0 lg:border-r ${
            collapsed ? "lg:w-16" : "lg:w-56"
          } transition-[width] duration-200`}
        >
          <div className="flex h-full flex-col">
            <nav className="flex-1 p-2">
              {TABS.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    // The label is still the accessible name when collapsed —
                    // an icon-only link with no name is unusable with a screen
                    // reader, and unguessable with a mouse.
                    title={collapsed ? t(item.labelKey) : undefined}
                    aria-label={collapsed ? t(item.labelKey) : undefined}
                    className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? "bg-brand font-semibold text-white"
                        : "text-ink-muted hover:bg-sand"
                    } ${collapsed ? "lg:justify-center lg:px-0" : ""}`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className={collapsed ? "lg:hidden" : ""}>{t(item.labelKey)}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-sand p-2">
              {/* The way out. The owner area had no link back to the public
                  site at all before this. */}
              <Link
                href="/"
                title={collapsed ? t("backToZuriDrive") : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-sand hover:text-brand ${
                  collapsed ? "lg:justify-center lg:px-0" : ""
                }`}
              >
                <ArrowLeft className="h-4 w-4 shrink-0" />
                <span className={collapsed ? "lg:hidden" : ""}>
                  {t("backToZuriDrive")}
                </span>
              </Link>

              <button
                onClick={toggleCollapsed}
                className={`hidden w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-faint transition-colors hover:bg-sand hover:text-ink lg:flex ${
                  collapsed ? "lg:justify-center lg:px-0" : ""
                }`}
                aria-label={collapsed ? "Expand menu" : "Collapse menu"}
              >
                {collapsed ? (
                  <PanelLeftOpen className="h-4 w-4 shrink-0" />
                ) : (
                  <>
                    <PanelLeftClose className="h-4 w-4 shrink-0" />
                    <span>{t("collapse")}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
