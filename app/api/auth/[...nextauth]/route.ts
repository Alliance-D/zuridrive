// =============================================================================
// ZuriDrive — NextAuth route handler
// App Router route files may ONLY export HTTP method handlers, so the config
// itself lives in lib/auth-options.ts. Import `authOptions` from there.
// =============================================================================

import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth-options";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
