// =============================================================================
// ZuriDrive — Root Layout
// Wraps every page with: SessionProvider, global CSS, metadata, and nav
// Server component — only the SessionProvider wrapper is client-side
// =============================================================================

import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import LanguagePrompt from "@/components/i18n/LanguagePrompt";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import AuthProvider from "@/components/auth-provider";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: {
    default: "ZuriDrive — Car Rentals in Rwanda",
    template: "%s | ZuriDrive",
  },
  description:
    "Rwanda's premier car rental marketplace. Find and book trusted cars from verified owners across Kigali and beyond.",
  keywords: [
    "car rental Rwanda",
    "hire car Kigali",
    "Rwanda car hire",
    "ZuriDrive",
    "self drive Rwanda",
  ],
  authors: [{ name: "ZuriDrive" }],
  creator: "ZuriDrive",
  openGraph: {
    type: "website",
    locale: "en_RW",
    url: "https://zuridrive.rw",
    siteName: "ZuriDrive",
    title: "ZuriDrive — Car Rentals in Rwanda",
    description:
      "Rwanda's premier car rental marketplace. Trusted cars, transparent pricing, seamless booking.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "ZuriDrive — Car Rentals in Rwanda",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ZuriDrive — Car Rentals in Rwanda",
    description: "Rwanda's premier car rental marketplace.",
    images: ["/og-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  manifest: "/manifest.json",
  // Icons come from the file convention — app/icon.svg and app/apple-icon.svg.
  // Next generates the correct <link> tags and cache-busting hashes from those,
  // so they are never declared by hand here; the previous hand-written paths
  // pointed at three files that did not exist and 404'd on every page load.
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#1B4332",
};

interface RootLayoutProps {
  children: React.ReactNode;
  params: { locale: string };
}

/**
 * Pre-render every locale at build time instead of on first request.
 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({ children, params }: RootLayoutProps) {
  const { locale } = params;

  // An unknown locale in the URL is a 404, not a silent fallback — otherwise
  // /xx/cars would quietly serve English and get indexed as a real page.
  if (!routing.locales.includes(locale as Locale)) notFound();

  setRequestLocale(locale);

  // Pre-fetch session server-side so SessionProvider doesn't need a round-trip
  const [session, messages] = await Promise.all([
    getServerSession(authOptions),
    getMessages(),
  ]);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Preconnect to Google Fonts for faster font loading */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <AuthProvider session={session}>
            {/* Offered once, only when the browser asks for a language other
                than the one being served. Above the nav so it never covers
                content. */}
            <LanguagePrompt />
            {/* Main content — each page renders here */}
            <main id="main-content">{children}</main>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
