/**
 * Next.js instrumentation hook — runs once per runtime at startup.
 *
 * Initialises Sentry for the server and edge runtimes. Both are inert without
 * SENTRY_DSN, so local development and CI never post anywhere.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Next calls this for every server-side error, including in Server Components
// and route handlers. Sentry exports it as captureRequestError.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
