// =============================================================================
// ZuriDrive — Root Layout
// Wraps every page with: SessionProvider, global CSS, metadata, and nav
// Server component — only the SessionProvider wrapper is client-side
// =============================================================================

import type { Metadata, Viewport } from "next";
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
}

export default async function RootLayout({ children }: RootLayoutProps) {
  // Pre-fetch session server-side so SessionProvider doesn't need a round-trip
  const session = await getServerSession(authOptions);

  return (
    <html lang="en" suppressHydrationWarning>
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
        <AuthProvider session={session}>
          {/* Main content — each page renders here */}
          <main id="main-content">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
