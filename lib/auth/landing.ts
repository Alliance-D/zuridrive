/**
 * Where a user goes after signing in.
 *
 * The bug this replaces: the login page hardcoded a callback of "/dashboard"
 * for everyone. /dashboard is the CLIENT area, and its layout bounces anyone
 * who is not a CLIENT to "/". So every owner and every admin signed in, was
 * thrown to the home page, and had to find their own way back.
 *
 * The rule now:
 *
 *   • If the user was trying to reach a specific page and got sent to sign in,
 *     they go back to THAT page. Interrupting someone and then dumping them
 *     somewhere else loses their intent.
 *
 *   • Otherwise they go to the area they actually work in — owners to the owner
 *     dashboard, admins to admin, clients to their bookings.
 */

export type Role = "SUPER_ADMIN" | "SUB_ADMIN" | "OWNER" | "CLIENT";

/** The home area for each role. */
export function homeAreaForRole(role: string | undefined): string {
  switch (role) {
    case "SUPER_ADMIN":
    case "SUB_ADMIN":
      return "/admin";
    case "OWNER":
      // /owner has no index route of its own; the owner area is rooted at
      // /owner/dashboard. Sending them to /owner would 404.
      return "/owner/dashboard";
    case "CLIENT":
      return "/dashboard";
    default:
      return "/";
  }
}

/** Areas a role is actually allowed into, mirroring middleware.ts. */
function canAccess(role: string | undefined, path: string): boolean {
  if (path.startsWith("/admin")) {
    return role === "SUPER_ADMIN" || role === "SUB_ADMIN";
  }
  if (path.startsWith("/owner")) {
    return role === "OWNER" || role === "SUPER_ADMIN";
  }
  // The client dashboard layout admits CLIENT only.
  if (path.startsWith("/dashboard")) {
    return role === "CLIENT";
  }
  // Public pages are fine for anyone signed in.
  return true;
}

/**
 * Resolves the post-login destination.
 *
 * `requested` is whatever the sign-in link carried (?callbackUrl= or ?next=).
 * It is only honoured when it is a same-site path the role can actually reach —
 * sending someone to a page that will immediately bounce them is worse than
 * ignoring their request, and an absolute URL here would be an open redirect.
 */
export function resolveLandingPath(
  role: string | undefined,
  requested?: string | null,
): string {
  const home = homeAreaForRole(role);

  if (!requested) return home;

  // Must be a relative path. "//evil.test" and "https://evil.test" are both
  // rejected — the first is protocol-relative and browsers treat it as absolute.
  if (!requested.startsWith("/") || requested.startsWith("//")) return home;

  // Never bounce someone back to the login screen they just left.
  if (requested.startsWith("/login") || requested.startsWith("/signup")) {
    return home;
  }

  return canAccess(role, requested) ? requested : home;
}
