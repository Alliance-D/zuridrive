"use client";

// =============================================================================
// ZuriDrive — Navigation Bar
// - Transparent over hero sections, becomes solid on scroll
// - Shows role-appropriate links based on session
// - Mobile: hamburger menu with slide-in drawer
// - Always visible — position: fixed
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown, Car, User, LogOut, LayoutDashboard } from "lucide-react";
import { ROUTES } from "@/lib/routes";

// Pages whose hero is DARK enough for white nav text to be legible on it.
//
// This is not "pages with a hero" — it is specifically pages with a dark one.
// /how-it-works and /become-an-owner were listed here, but their heroes use
// --color-surface (a light cream), so the nav rendered white text on an almost
// white background and the links were effectively invisible until you scrolled.
//
// Only the home page has a full-bleed dark hero: --color-primary-dark behind a
// car photograph. Anything added here must be checked the same way.
const DARK_HERO_PAGES = ["/"];

export default function Navbar() {
  const t = useTranslations("nav");
  const tc = useTranslations("cars");
  const { data: session, status } = useSession();
  const pathname = usePathname();

  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Determine if this page has a hero (nav starts transparent)
  const isHeroPage = DARK_HERO_PAGES.includes(pathname);

  // Track scroll position to switch nav style
  const handleScroll = useCallback(() => {
    setIsScrolled(window.scrollY > 40);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileOpen(false);
    setIsUserMenuOpen(false);
  }, [pathname]);

  // Close user menu on outside click
  useEffect(() => {
    if (!isUserMenuOpen) return;
    const handler = () => setIsUserMenuOpen(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [isUserMenuOpen]);

  const isTransparent = isHeroPage && !isScrolled && !isMobileOpen;

  return (
    <>
      <nav
        className={`nav ${isTransparent ? "nav-transparent" : "nav-solid"}`}
        style={{ zIndex: "var(--z-sticky)" }}
      >
        {/* .container sets its own max-width and padding in globals.css, which
            is fine here — only the height/flex behaviour is added. */}
        <div className="container flex h-[var(--nav-height)] items-center justify-between">

          {/* ---------------------------------------------------------------- */}
          {/* LOGO                                                              */}
          {/* ---------------------------------------------------------------- */}
          <Link href={ROUTES.home} className="flex items-center gap-2 no-underline">
            {/* Wordmark — uses display font for the premium feel. The colour
                flips with the transparent/solid variant, so it is conditional. */}
            <span
              className={`font-display text-[clamp(1.4rem,3vw,1.75rem)] font-semibold leading-[1.15] tracking-[-0.02em] transition-colors ${
                isTransparent ? "text-white" : "text-brand"
              }`}
            >
              Zuri<span className="text-accent">Drive</span>
            </span>
          </Link>

          {/* ---------------------------------------------------------------- */}
          {/* DESKTOP NAV LINKS                                                */}
          {/* ---------------------------------------------------------------- */}
          <div className="hide-mobile flex items-center gap-6">
            <NavLink href={ROUTES.cars} transparent={isTransparent}>
              {t("browseCars")}
            </NavLink>
            <NavLink href={ROUTES.howItWorks} transparent={isTransparent}>
              {t("howItWorks")}
            </NavLink>
            <NavLink href={ROUTES.becomeAnOwner} transparent={isTransparent}>
              {t("listYourCar")}
            </NavLink>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* DESKTOP AUTH / USER MENU                                         */}
          {/* ---------------------------------------------------------------- */}
          <div className="hide-mobile flex items-center gap-3">
            {/* Permanent way to change language, for anyone who dismissed the
                prompt or changed their mind later. */}
            <LanguageSwitcher dark={isTransparent} />
            {status === "loading" ? (
              // Skeleton while session loads
              <div className="skeleton h-9 w-[120px] rounded-full" />
            ) : session ? (
              // Logged in — user menu dropdown
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setIsUserMenuOpen(!isUserMenuOpen); }}
                  className={`flex cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-4 py-2 font-sans text-fluid-sm font-medium transition-all ${
                    isTransparent
                      ? "border-white/30 bg-white/[0.12] text-white backdrop-blur-[8px]"
                      : "border-sand-edge bg-sand text-ink"
                  }`}
                >
                  <User size={15} />
                  <span>{session.user.name?.split(" ")[0] ?? "Account"}</span>
                  <ChevronDown
                    size={13}
                    className={`transition-transform ${isUserMenuOpen ? "rotate-180" : "rotate-0"}`}
                  />
                </button>

                {/* Dropdown */}
                {isUserMenuOpen && (
                  <div className="absolute right-0 top-[calc(100%_+_8px)] w-[220px] origin-top-right animate-[scaleIn_0.15s_ease_forwards] overflow-hidden rounded-3xl border border-sand-light bg-white shadow-[var(--shadow-lg)]">
                    {/* Dashboard link — role-appropriate */}
                    <DropdownItem
                      href={getDashboardPath(session.user.role)}
                      icon={<LayoutDashboard size={15} />}
                      label={t("myDashboard")}
                    />
                    {session.user.role === "OWNER" && (
                      <DropdownItem
                        href={ROUTES.ownerFleet}
                        icon={<Car size={15} />}
                        label={t("myFleet")}
                      />
                    )}
                    <DropdownItem
                      href={getProfilePath(session.user.role)}
                      icon={<User size={15} />}
                      label="Profile"
                    />
                    <div className="my-1 h-px bg-sand-light" />
                    {/* Hover was done imperatively with onMouseEnter/onMouseLeave
                        writing to element.style. A hover: utility does the same
                        thing declaratively, and does not fight the cascade. */}
                    <button
                      onClick={() => signOut({ callbackUrl: "/" })}
                      className="flex w-full cursor-pointer items-center gap-2.5 border-none bg-none px-4 py-2.5 text-left font-sans text-fluid-sm text-danger-error transition-colors hover:bg-danger-bg"
                    >
                      <LogOut size={15} />
                      {t("signOut")}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              // Not logged in
              <>
                <Link
                  href={ROUTES.login}
                  className={`rounded-full px-4 py-2 text-fluid-sm font-medium transition-all ${
                    isTransparent ? "text-white/85" : "text-ink"
                  }`}
                >
                  {t("signIn")}
                </Link>
                <Link
                  href={ROUTES.cars}
                  className="btn btn-primary btn-sm"
                  style={isTransparent ? {
                    background: "var(--color-accent)",
                    borderColor: "var(--color-accent)",
                    color: "var(--color-text)",
                  } : {}}
                >
                  {tc("browseCars")}
                </Link>
              </>
            )}
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* MOBILE HAMBURGER                                                 */}
          {/* ---------------------------------------------------------------- */}
          <button
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            aria-label="Toggle menu"
            className={`hide-desktop cursor-pointer border-none bg-none p-2 ${
              isTransparent ? "text-white" : "text-ink"
            }`}
          >
            {isMobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      {/* -------------------------------------------------------------------- */}
      {/* MOBILE DRAWER                                                         */}
      {/* -------------------------------------------------------------------- */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 top-[var(--nav-height)] flex animate-[slideUp_0.25s_ease_forwards] flex-col gap-2 overflow-y-auto bg-bone px-5 py-6"
          style={{ zIndex: "calc(var(--z-sticky) - 1)" }}
        >
          <MobileNavLink href={ROUTES.cars}>{t("browseCars")}</MobileNavLink>
          <MobileNavLink href={ROUTES.howItWorks}>{t("howItWorks")}</MobileNavLink>
          <MobileNavLink href={ROUTES.becomeAnOwner}>{t("listYourCar")}</MobileNavLink>

          <div className="my-4 h-px bg-sand-edge" />

          {session ? (
            <>
              <MobileNavLink href={getDashboardPath(session.user.role)}>
                {t("myDashboard")}
              </MobileNavLink>
              {session.user.role === "OWNER" && (
                <MobileNavLink href={ROUTES.ownerFleet}>{t("myFleet")}</MobileNavLink>
              )}
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="cursor-pointer rounded-2xl border-none bg-none p-4 text-left font-sans text-fluid-lg font-medium text-danger-error"
              >
                {t("signOut")}
              </button>
            </>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {/* .btn already sets justify-content: center, so the old inline
                  justifyContent was redundant. */}
              <Link href={ROUTES.login} className="btn btn-secondary btn-lg">
                Sign In
              </Link>
              <Link href={ROUTES.signupOwner} className="btn btn-primary btn-lg">
                List Your Car
              </Link>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// --------------------------------------------------------------------------
// SUB-COMPONENTS
// --------------------------------------------------------------------------

function NavLink({
  href, children, transparent,
}: { href: string; children: React.ReactNode; transparent: boolean }) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={`border-b-[1.5px] py-1 text-fluid-sm font-medium tracking-[0.01em] no-underline transition-all ${
        transparent ? "text-white/85" : isActive ? "text-brand" : "text-ink"
      } ${
        isActive
          ? transparent
            ? "border-white/60"
            : "border-brand"
          : "border-transparent"
      }`}
    >
      {children}
    </Link>
  );
}

function MobileNavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block rounded-2xl p-4 font-sans text-fluid-lg font-medium text-ink no-underline transition-colors hover:bg-sand"
    >
      {children}
    </Link>
  );
}

function DropdownItem({
  href, icon, label,
}: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-4 py-2.5 text-fluid-sm text-ink no-underline transition-colors hover:bg-sand"
    >
      <span className="text-ink-soft">{icon}</span>
      {label}
    </Link>
  );
}

// --------------------------------------------------------------------------
// HELPERS
// --------------------------------------------------------------------------

function getDashboardPath(role: string): string {
  switch (role) {
    case "SUPER_ADMIN":
    case "SUB_ADMIN": return "/admin";
    case "OWNER": return "/owner/dashboard";
    default: return "/dashboard";
  }
}

function getProfilePath(role: string): string {
  switch (role) {
    case "OWNER": return "/owner/profile";
    default: return "/dashboard/profile";
  }
}
