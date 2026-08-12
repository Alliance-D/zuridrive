"use client";

// =============================================================================
// ZuriDrive — NextAuth Session Provider
// Wraps the app in SessionProvider so useSession() works in Client Components
// This is a thin "use client" wrapper — keep it minimal
// Import and use in the root layout.tsx
// =============================================================================

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";

interface AuthProviderProps {
  children: React.ReactNode;
  session?: Session | null;
}

export default function AuthProvider({ children, session }: AuthProviderProps) {
  return <SessionProvider session={session}>{children}</SessionProvider>;
}
