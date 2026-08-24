"use client";

/**
 * AdminLayout — Admin console shell.
 *
 * The sidebar is filtered by the viewer's role modules. A sub-admin never sees
 * a link to a section they can't open — the server still enforces access on
 * every page and endpoint, but hiding the link avoids dead ends.
 *
 * Super admins see everything.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";
import { signOut } from "next-auth/react";
import type { AdminRoleModule } from "@prisma/client";
import {
  LayoutDashboard,
  Users,
  Car,
  CalendarDays,
  Wallet,
  Scale,
  Star,
  MapPin,
  Map,
  Bell,
  BarChart3,
  LifeBuoy,
  Settings,
  Tags,
  UserCog,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";

interface NavItem {
  /** Message key under the `admin` namespace, resolved at render. */
  labelKey: string;
  href: string;
  icon: React.ElementType;
  /** Module required to see this. null = super admin only. */
  module: AdminRoleModule | null;
}

const NAV: NavItem[] = [
  { labelKey: "overview",      href: "/admin",               icon: LayoutDashboard, module: null },
  { labelKey: "finance",       href: "/admin/finance",       icon: Wallet,          module: "FINANCE_MANAGER" },
  { labelKey: "deposits",      href: "/admin/finance/deposits", icon: ShieldCheck,  module: "DEPOSIT_MANAGER" },
  { labelKey: "disputes",      href: "/admin/disputes",      icon: Scale,           module: "BOOKING_MANAGER" },
  { labelKey: "bookings",      href: "/admin/bookings",      icon: CalendarDays,    module: "BOOKING_MANAGER" },
  { labelKey: "fleet",         href: "/admin/fleet",         icon: Car,             module: "FLEET_MANAGER" },
  { labelKey: "users",         href: "/admin/users",         icon: Users,           module: "USER_MANAGER" },
  { labelKey: "reviews",       href: "/admin/reviews",       icon: Star,            module: "CONTENT_MODERATOR" },
  { labelKey: "locations",     href: "/admin/locations",     icon: MapPin,          module: "CONTENT_MODERATOR" },
  { labelKey: "neighbourhoods", href: "/admin/neighborhoods", icon: Map,            module: "CONTENT_MODERATOR" },
  { labelKey: "notifications", href: "/admin/notifications", icon: Bell,            module: "COMMUNICATIONS" },
  { labelKey: "analytics",     href: "/admin/analytics",     icon: BarChart3,       module: "ANALYTICS_VIEWER" },
  { labelKey: "support",       href: "/admin/support",       icon: LifeBuoy,        module: "SUPPORT_AGENT" },
  { labelKey: "team",          href: "/admin/team",          icon: UserCog,         module: null },
  { labelKey: "plans",         href: "/admin/plans",         icon: Tags,            module: null },
  { labelKey: "settings",      href: "/admin/settings",      icon: Settings,        module: null },
];

interface AdminLayoutProps {
  children: React.ReactNode;
  isSuperAdmin: boolean;
  roleModules: AdminRoleModule[];
  adminName: string;
}

export default function AdminLayout({
  children,
  isSuperAdmin,
  roleModules,
  adminName,
}: AdminLayoutProps) {
  const t = useTranslations("admin");
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visible = NAV.filter((item) => {
    if (isSuperAdmin) return true;
    if (item.module === null) return false; // super-admin-only sections
    return roleModules.includes(item.module);
  });

  // Longest matching href wins so /admin/finance/payouts highlights Finance.
  const active =
    [...visible]
      .sort((a, b) => b.href.length - a.href.length)
      .find((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
      ?.href ?? "/admin";

  const initials = adminName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="min-h-screen bg-bone font-sans">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-ink text-white">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="rounded-lg p-1.5 hover:bg-white/10 lg:hidden"
              aria-label="Menu"
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <Link href="/admin" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
                <ShieldCheck className="h-4 w-4 text-ink" />
              </div>
              <div className="leading-tight">
                <p className="font-display text-lg font-semibold leading-[1.15] tracking-[-0.02em] text-white">Zuri<span className="text-accent">Drive</span></p>
                <p className="text-[10px] uppercase tracking-wider text-white/50">
                  {isSuperAdmin ? t("superAdmin") : t("admin")}
                </p>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-white/70 sm:block">{adminName}</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-ink">
              {initials}
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="rounded-lg p-1.5 hover:bg-white/10"
              aria-label={t("signOut")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`${
            mobileOpen ? "block" : "hidden"
          } fixed inset-x-0 top-[52px] z-30 border-b border-sand-dark bg-white lg:sticky lg:top-[52px] lg:block lg:h-[calc(100vh-52px)] lg:w-56 lg:shrink-0 lg:border-b-0 lg:border-r`}
        >
          <nav className="p-2">
            {visible.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-brand font-semibold text-white"
                      : "text-ink-muted hover:bg-sand"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>

          {!isSuperAdmin && (
            <p className="px-4 pb-4 text-[11px] text-ink-faint">
              You&apos;re seeing the sections your role covers. Ask a Super Admin
              if you need more access.
            </p>
          )}

          {/* A route back to the public site. Neither the admin nor the owner
              area had one, so the only way out was the browser's back button. */}
          <div className="border-t border-sand p-2">
            <Link
              href="/"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-sand hover:text-brand"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              {t("backToZuriDrive")}
            </Link>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
