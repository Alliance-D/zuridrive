/**
 * Root not-found — for requests that match no route at all.
 *
 * This is the fix for "Failed to execute 'appendChild' on 'Node': Only one
 * element on document allowed."
 *
 * app/[locale]/not-found.tsx only handles a 404 *inside* a valid locale
 * segment, because the layout that renders <html> and <body> lives at
 * app/[locale]/layout.tsx. A request that never matches [locale] — anything
 * the middleware skips, such as a path containing a dot — had no layout above
 * it at all. React's container then became `document` itself, and mounting the
 * page tried to append a <div> as a sibling of <html>, which the DOM forbids.
 *
 * So this file renders the whole document itself. It is deliberately plain:
 * there is no locale to read, so nothing here is translated, and it must not
 * depend on providers that only exist inside the [locale] tree.
 */

import { Link } from "@/i18n/navigation";

export const metadata = {
  title: "Page not found — ZuriDrive",
};

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FAF9F6",
          color: "#1A1A1A",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          padding: "2rem",
        }}
      >
        <main style={{ maxWidth: "28rem", textAlign: "center" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.75rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#6B7280",
            }}
          >
            404
          </p>
          <h1
            style={{
              margin: "0.75rem 0 0",
              fontSize: "1.75rem",
              fontWeight: 600,
              lineHeight: 1.2,
            }}
          >
            We can&apos;t find that page
          </h1>
          <p
            style={{
              margin: "0.75rem 0 1.75rem",
              fontSize: "0.95rem",
              lineHeight: 1.6,
              color: "#4B5563",
            }}
          >
            The link may be broken, or the page may have moved.
          </p>
          <Link
            href="/en"
            style={{
              display: "inline-block",
              background: "#1B4332",
              color: "#FFFFFF",
              padding: "0.7rem 1.5rem",
              borderRadius: "999px",
              fontSize: "0.9rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Go to ZuriDrive
          </Link>
        </main>
      </body>
    </html>
  );
}
