// =============================================================================
// ZuriDrive — Auth Utilities
// Server-side helpers for getting sessions, checking roles, and hashing passwords
// Use these in Server Components and API routes — never call getServerSession
// directly in multiple places; go through these helpers for consistency
// =============================================================================

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { AdminRoleModule, UserRole } from "@prisma/client";

// Re-exported so route handlers and pages can pull config + helpers from one
// place: `import { authOptions, getSession } from "@/lib/auth"`.
export { authOptions };

// =============================================================================
// SESSION GETTERS
// =============================================================================

/**
 * Gets the current server session.
 * Returns null if not authenticated.
 * Use in Server Components and API routes.
 */
export async function getSession() {
  return getServerSession(authOptions);
}

/**
 * Gets the current session and redirects to /login if not authenticated.
 * Use at the top of any protected Server Component page.
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
}

/**
 * Gets the current user from session.
 * Throws if not authenticated — use in API routes.
 */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session?.user) {
    return null;
  }
  return session.user;
}

// =============================================================================
// ROLE GUARDS
// Use these in Server Components for page-level access control
// Middleware handles route-level protection (see middleware.ts)
// =============================================================================

/**
 * Requires CLIENT role (or higher).
 * Redirects to login if unauthenticated, home if wrong role.
 */
export async function requireClient() {
  const session = await requireAuth();
  if (
    session.user.role !== "CLIENT" &&
    session.user.role !== "OWNER" &&
    session.user.role !== "SUB_ADMIN" &&
    session.user.role !== "SUPER_ADMIN"
  ) {
    redirect("/");
  }
  return session;
}

/**
 * Requires OWNER role.
 */
export async function requireOwner() {
  const session = await requireAuth();
  if (session.user.role !== "OWNER" && session.user.role !== "SUPER_ADMIN") {
    redirect("/");
  }
  return session;
}

/**
 * Requires SUPER_ADMIN role — full admin access.
 */
export async function requireSuperAdmin() {
  const session = await requireAuth();
  if (session.user.role !== "SUPER_ADMIN") {
    redirect("/login");
  }
  return session;
}

/**
 * Requires either SUPER_ADMIN or SUB_ADMIN with a specific role module.
 * Sub-admins without the required module are redirected to their dashboard.
 */
export async function requireAdminModule(module: AdminRoleModule) {
  const session = await requireAuth();

  if (session.user.role === "SUPER_ADMIN") {
    return session; // Super admin always has access
  }

  if (session.user.role !== "SUB_ADMIN") {
    redirect("/login");
  }

  if (!session.user.roleModules?.includes(module)) {
    // Don't show a 403 — just redirect to admin home
    // Sub-admins should never see sections they don't have access to (sidebar filters)
    redirect("/admin");
  }

  return session;
}

/**
 * Checks if current user has a specific admin module (without redirecting).
 * Use this for conditional rendering within admin pages.
 */
export async function hasAdminModule(module: AdminRoleModule): Promise<boolean> {
  const session = await getSession();
  if (!session?.user) return false;
  if (session.user.role === "SUPER_ADMIN") return true;
  return session.user.roleModules?.includes(module) ?? false;
}

/**
 * Checks if current user is any type of admin.
 */
export async function isAdmin(): Promise<boolean> {
  const session = await getSession();
  return (
    session?.user?.role === "SUPER_ADMIN" ||
    session?.user?.role === "SUB_ADMIN"
  );
}

// =============================================================================
// PASSWORD UTILITIES
// =============================================================================

const BCRYPT_SALT_ROUNDS = 12; // As specified in requirements

/**
 * Hashes a plain-text password using bcrypt with 12 salt rounds.
 * Use when creating or updating passwords.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Verifies a plain-text password against a bcrypt hash.
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// =============================================================================
// ERROR CODE → USER MESSAGE MAPPING
// Never show raw auth errors to users — map to friendly messages
// =============================================================================

export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  MISSING_CREDENTIALS:
    "Please enter your phone number and verification code.",
  USER_NOT_FOUND:
    "We couldn't find an account with that phone number. Would you like to sign up?",
  OTP_NOT_FOUND:
    "No verification code found. Please request a new code.",
  OTP_EXPIRED:
    "Your verification code has expired. Please request a new one.",
  OTP_INVALID:
    "Incorrect code. Please check your SMS and try again.",
  OTP_LOCKED:
    "Too many incorrect attempts. Please wait 15 minutes before trying again.",
  INVALID_CREDENTIALS:
    "Incorrect email or password. Please try again.",
  ACCOUNT_SUSPENDED:
    "Your account has been suspended. Please contact ZuriDrive support for help.",
  SMS_FAILED:
    "We couldn't send the verification code. Please check your number and try again.",
  RATE_LIMITED:
    "Too many requests. Please wait a few minutes before trying again.",
  SERVER_ERROR:
    "Something went wrong on our end. Please try again in a moment.",
  // NextAuth default errors
  OAuthSignin: "There was a problem signing you in. Please try again.",
  OAuthCallback: "There was a problem signing you in. Please try again.",
  Default: "An unexpected error occurred. Please try again.",
};

/**
 * Maps an error code to a user-friendly message.
 * Falls back to a generic message if code isn't mapped.
 */
export function getAuthErrorMessage(errorCode: string): string {
  return (
    AUTH_ERROR_MESSAGES[errorCode] ??
    AUTH_ERROR_MESSAGES.Default
  );
}

// =============================================================================
// ROLE DISPLAY HELPERS
// =============================================================================

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  SUB_ADMIN: "Admin",
  OWNER: "Car Owner",
  CLIENT: "Client",
};

export const MODULE_LABELS: Record<AdminRoleModule, string> = {
  USER_MANAGER: "User Manager",
  FLEET_MANAGER: "Fleet Manager",
  BOOKING_MANAGER: "Booking Manager",
  FINANCE_MANAGER: "Finance Manager",
  DEPOSIT_MANAGER: "Deposit Manager",
  CONTENT_MODERATOR: "Content Moderator",
  COMMUNICATIONS: "Communications",
  ANALYTICS_VIEWER: "Analytics Viewer",
  SUPPORT_AGENT: "Support Agent",
};

/**
 * Gets the redirect path for a user based on their role.
 * Called after successful login to route to the right dashboard.
 */
export function getRoleHomePath(role: UserRole): string {
  switch (role) {
    case "SUPER_ADMIN":
    case "SUB_ADMIN":
      return "/admin";
    case "OWNER":
      return "/owner/dashboard";
    case "CLIENT":
    default:
      return "/dashboard";
  }
}
