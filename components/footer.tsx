// =============================================================================
// ZuriDrive — Footer
// Server component — static links, no interactivity needed
// =============================================================================

import Link from "next/link";
import { ROUTES } from "@/lib/routes";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-brand-darkest pb-[clamp(1.5rem,3vw,2.5rem)] pt-[clamp(3rem,6vw,5rem)] text-white/75">
      <div className="container">
        {/* footer-grid is also targeted by the responsive rules in globals.css,
            which carry !important so they still beat this utility on mobile. */}
        <div className="footer-grid mb-[clamp(2rem,4vw,3.5rem)] grid grid-cols-[2fr_repeat(3,1fr)] gap-[clamp(2rem,4vw,4rem)]">
          {/* Brand column */}
          <div>
            <div className="mb-4 font-display text-[clamp(1.5rem,3vw,2rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-white">
              Zuri<span className="text-accent">Drive</span>
            </div>
            <p className="max-w-[32ch] text-fluid-sm leading-[1.7] text-white/55">
              Rwanda&apos;s premier car rental marketplace. Verified cars,
              transparent pricing, seamless booking.
            </p>

            {/* Contact */}
            <div className="mt-5">
              <p className="mb-2 font-mono text-fluid-xs uppercase tracking-[0.08em] text-white/40">
                Contact
              </p>
              <a
                href="tel:+250700000000"
                className="mb-1 block text-fluid-sm text-white/65 no-underline"
              >
                +250 700 000 000
              </a>
              <a
                href="mailto:hello@zuridrive.rw"
                className="block text-fluid-sm text-white/65 no-underline"
              >
                hello@zuridrive.rw
              </a>
            </div>
          </div>

          {/* Renters */}
          <div>
            <FooterHeading>Renters</FooterHeading>
            <FooterLinks links={[
              { label: "Browse Cars", href: ROUTES.cars },
              { label: "How It Works", href: ROUTES.howItWorks },
              { label: "Pricing & Deposits", href: `${ROUTES.howItWorks}#pricing` },
              { label: "Fuel Policies", href: `${ROUTES.howItWorks}#fuel` },
              { label: "Sign Up", href: ROUTES.signup },
            ]} />
          </div>

          {/* Owners */}
          <div>
            <FooterHeading>Car Owners</FooterHeading>
            <FooterLinks links={[
              { label: "List Your Car", href: ROUTES.becomeAnOwner },
              { label: "Owner Dashboard", href: ROUTES.ownerDashboard },
              { label: "Subscription Plans", href: `${ROUTES.becomeAnOwner}#plans` },
              { label: "Earnings & Payouts", href: `${ROUTES.becomeAnOwner}#earnings` },
              { label: "Create an owner account", href: ROUTES.signupOwner },
            ]} />
          </div>

          {/* Legal */}
          <div>
            <FooterHeading>Company</FooterHeading>
            <FooterLinks links={[
              { label: "About ZuriDrive", href: "/about" },
              { label: "Terms of Service", href: "/terms" },
              { label: "Privacy Policy", href: "/privacy" },
              { label: "Help Center", href: "/help" },
              { label: "Contact Us", href: "/contact" },
            ]} />
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] pt-6">
          <p className="font-mono text-fluid-xs text-white/35">
            © {year} ZuriDrive Ltd. All rights reserved. Kigali, Rwanda.
          </p>
          <div className="flex gap-5">
            <a href="/privacy" className="text-fluid-xs text-white/35 no-underline">Privacy</a>
            <a href="/terms" className="text-fluid-xs text-white/35 no-underline">Terms</a>
            <a href="/cookies" className="text-fluid-xs text-white/35 no-underline">Cookies</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 font-mono text-fluid-xs uppercase tracking-[0.1em] text-white/40">
      {children}
    </p>
  );
}

function FooterLinks({ links }: { links: { label: string; href: string }[] }) {
  return (
    <ul className="flex list-none flex-col gap-3">
      {links.map((link) => (
        <li key={link.href}>
          {/* Hover colour comes from .footer-link in globals.css — Footer is a
              server component and cannot pass event handlers to the client. */}
          <Link
            href={link.href}
            className="footer-link inline-block text-fluid-sm no-underline"
          >
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
