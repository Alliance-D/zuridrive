/**
 * Root layout — a pass-through.
 *
 * Every real page lives under app/[locale], and app/[locale]/layout.tsx is what
 * renders <html> and <body>. This file exists only because Next requires a
 * layout at the root of app/, and because without one there is nothing to
 * render a not-found into when a request matches no route at all.
 *
 * It must NOT render <html> or <body> itself — that would nest a second
 * document inside the one [locale]/layout.tsx already provides.
 *
 * See app/not-found.tsx for the case this pairs with.
 */

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
