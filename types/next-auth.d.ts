// =============================================================================
// ZuriDrive — NextAuth Type Extensions
// Augments the default Session and JWT types with our custom user fields
// These must match the fields we return in the jwt() and session() callbacks
// =============================================================================

import { UserRole, AdminRoleModule } from "@prisma/client";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      phone: string;          // Primary identifier — always present
      email?: string | null;
      name?: string | null;
      role: UserRole;
      isSuspended: boolean;
      isVerified: boolean;
      // Sub-admin only — which modules they can access
      roleModules?: AdminRoleModule[];
      // Owner only — onboarding state
      isOnboardingComplete?: boolean;
    };
  }

  interface User {
    id: string;
    phone: string;
    email?: string | null;
    name?: string | null;
    role: UserRole;
    isSuspended: boolean;
    isVerified: boolean;
    roleModules?: AdminRoleModule[];
    isOnboardingComplete?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    phone: string;
    role: UserRole;
    isSuspended: boolean;
    isVerified: boolean;
    roleModules?: AdminRoleModule[];
    isOnboardingComplete?: boolean;
  }
}
