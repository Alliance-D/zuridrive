// =============================================================================
// ZuriDrive — Route protection middleware
//
// Coarse, route-level gating only. Fine-grained permissions (which admin
// modules a sub-admin may use) are enforced per-page via requireAdminModule()
// and per-API-route via requireModuleAccess() — those hit the database, this
// only reads the JWT.
//
// Roles are SUPER_ADMIN | SUB_ADMIN | OWNER | CLIENT. Module names such as
// FLEET_MANAGER are NOT roles — they live in token.roleModules.
// =============================================================================

import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(request) {
    const { pathname } = request.nextUrl;
    const token = request.nextauth.token;
    const role = token?.role;

    // A suspended user loses access everywhere immediately.
    if (token?.isSuspended) {
      const url = new URL("/login", request.url);
      url.searchParams.set("error", "ACCOUNT_SUSPENDED");
      return NextResponse.redirect(url);
    }

    // Admin area — super admins and sub-admins. Module checks happen per page.
    if (pathname.startsWith("/admin")) {
      if (role !== "SUPER_ADMIN" && role !== "SUB_ADMIN") {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }

    // Owner area — owners, plus super admins for support purposes.
    if (pathname.startsWith("/owner")) {
      if (role !== "OWNER" && role !== "SUPER_ADMIN") {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }

    // Client dashboard — every signed-in user has one. Owners and admins can
    // still hold personal bookings, so this is intentionally permissive.
    if (pathname.startsWith("/dashboard")) {
      if (!role) {
        return NextResponse.redirect(new URL("/login", request.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // withAuth redirects to the configured signIn page when this is false.
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/login",
    },
  },
);

export const config = {
  matcher: [
    "/admin/:path*",
    "/owner/:path*",
    "/dashboard/:path*",
  ],
};
