"use client";

/**
 * DashboardLayout — Client Dashboard Shell
 * Top navbar + horizontal tab navigation (Overview / Bookings / Profile)
 * Adapts active tab based on current pathname.
 */

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  CalendarDays,
  User,
  Bell,
  LogOut,
  Menu,
  X,
  Car,
  ChevronDown,
} from "lucide-react";

// ─── Tab definitions ───────────────────────────────────────────────────────────
//
// Profile is deliberately NOT here. It lives in the account dropdown in the top
// bar, which is where people look for it, and having it in both put the same
// destination on screen twice a few pixels apart.
//
// This bar is for the places a renter actually moves between. It has room to
// grow — /dashboard/reviews, /support and /favourites are all linked-to but do
// not exist yet — which is the other reason not to spend a slot on Profile.
const TABS = [
  { labelKey: "overview",  href: "/dashboard",           icon: LayoutDashboard },
  { labelKey: "bookings",  href: "/dashboard/bookings",  icon: CalendarDays    },
];

interface DashboardLayoutProps {
  children: React.ReactNode;
  /** Unread notification count from server */
  notificationCount?: number;
}

export default function DashboardLayout({
  children,
  notificationCount = 0,
}: DashboardLayoutProps) {
  const t = useTranslations("dashboard");
  const pathname  = usePathname();
  const router    = useRouter();
  const { data: session } = useSession();

  const [mobileMenuOpen, setMobileMenuOpen]     = useState(false);
  const [userMenuOpen,   setUserMenuOpen]        = useState(false);
  const [scrolled,       setScrolled]            = useState(false);

  // Navbar shadow on scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const close = () => { setUserMenuOpen(false); setMobileMenuOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const activeTab = TABS.findLast((t) => pathname.startsWith(t.href))?.href ?? "/dashboard";

  const userName = session?.user?.name ?? "Traveller";
  const userInitials = userName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="min-h-screen bg-bone font-sans">
      {/* ── Top Navbar ───────────────────────────────────────────────────── */}
      <header
        className={`sticky top-0 z-40 bg-white transition-shadow duration-200 ${
          scrolled ? "shadow-md" : "shadow-sm"
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 group">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand">
                <Car className="h-4 w-4 text-accent" />
              </div>
              <span className="font-display text-lg font-semibold leading-[1.15] tracking-[-0.02em] text-brand">Zuri<span className="text-accent">Drive</span></span>
            </Link>

            {/* Desktop right actions */}
            <div className="hidden md:flex items-center gap-3">
              {/* Notification bell */}
              <Link
                href="/dashboard/notifications"
                className="relative flex h-9 w-9 items-center justify-center rounded-full hover:bg-sand transition-colors"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5 text-ink-muted" />
                {notificationCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white leading-none">
                    {notificationCount > 9 ? "9+" : notificationCount}
                  </span>
                )}
              </Link>

              {/* User menu */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-full border border-sand-dark py-1.5 pl-1.5 pr-3 hover:border-brand transition-colors"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-bold text-accent">
                    {userInitials}
                  </div>
                  <span className="max-w-[120px] truncate text-sm font-medium text-ink">
                    {userName}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-ink-soft transition-transform ${
                      userMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* Dropdown */}
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-xl border border-sand-dark bg-white py-1 shadow-xl shadow-black/10 animate-in fade-in slide-in-from-top-2 duration-150">
                    <Link
                      href="/dashboard/profile"
                      className="flex items-center gap-2 px-4 py-2 text-sm text-ink-muted hover:bg-bone transition-colors"
                    >
                      <User className="h-4 w-4" /> {t("myProfile")}
                    </Link>
                    <div className="my-1 h-px bg-sand-dark" />
                    <button
                      onClick={() => signOut({ callbackUrl: "/" })}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="h-4 w-4" /> {t("signOut")}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Mobile hamburger */}
            <button
              className="md:hidden flex h-9 w-9 items-center justify-center rounded-full hover:bg-sand transition-colors"
              onClick={(e) => { e.stopPropagation(); setMobileMenuOpen((v) => !v); }}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5 text-ink-muted" />
              ) : (
                <Menu className="h-5 w-5 text-ink-muted" />
              )}
            </button>
          </div>
        </div>

        {/* ── Tab Navigation ─────────────────────────────────────────────── */}
        <div className="border-t border-sand-dark bg-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <nav className="flex gap-0 overflow-x-auto scrollbar-none" aria-label="Dashboard tabs">
              {TABS.map(({ labelKey, href, icon: Icon }) => {
                const isActive = activeTab === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`
                      relative flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium
                      transition-colors duration-150 select-none
                      ${isActive
                        ? "text-brand"
                        : "text-ink-soft hover:text-brand"
                      }
                    `}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    {t(labelKey)}
                    {/* Active underline */}
                    {isActive && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-brand" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* ── Mobile Menu ────────────────────────────────────────────────── */}
        {mobileMenuOpen && (
          <div
            className="md:hidden border-t border-sand-dark bg-white px-4 py-3 space-y-1"
            onClick={(e) => e.stopPropagation()}
          >
            {/* User info */}
            <div className="flex items-center gap-3 py-3 border-b border-sand-dark mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-bold text-accent">
                {userInitials}
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">{userName}</p>
                <p className="text-xs text-ink-soft">{session?.user?.phone ?? session?.user?.email ?? ""}</p>
              </div>
            </div>

            <Link
              href="/dashboard/notifications"
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-ink-muted hover:bg-bone"
            >
              <Bell className="h-4 w-4" />
              Notifications
              {notificationCount > 0 && (
                <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
                  {notificationCount}
                </span>
              )}
            </Link>

            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" /> {t("signOut")}
            </button>
          </div>
        )}
      </header>

      {/* ── Page Content ─────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
