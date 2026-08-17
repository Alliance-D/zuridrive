// =============================================================================
// ZuriDrive — NextAuth Configuration
// Primary auth: Phone number + OTP (via Africa's Talking)
// Fallback auth: Email + password (bcrypt hashed, salt 12)
// Phone is ALWAYS the primary identifier — email is optional
//
// Flow:
//   1. User enters phone → API sends OTP → User enters OTP → logged in
//   2. Credentials provider also handles email+password for admins
//   3. On login, session is enriched with role, modules, onboarding state
//   4. Session is invalidated immediately if user is suspended
//
// NOTE: This lives in lib/ — NOT in the route file. App Router route handlers
// may only export HTTP methods, so `authOptions` cannot be exported from
// app/api/auth/[...nextauth]/route.ts without failing the build.
// =============================================================================

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeRwandaPhone } from "@/lib/phone";

/**
 * A real bcrypt hash of a value nobody knows, compared against when the
 * account does not exist. Without it, an unknown phone number returns in
 * microseconds while a known one takes ~100ms, which is enough to enumerate
 * who has an account.
 */
const DUMMY_HASH =
  "$2a$12$C6UzMDM.H6dfI/f/IKcEe.9pKvzGGCVCYq6Fh0lPMDGRxTa5RgQ7O";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

export const authOptions: NextAuthOptions = {
  // Use JWT strategy — no database sessions needed (faster, works on edge)
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  // Custom pages — our own auth screens
  pages: {
    signIn: "/login",
    error: "/login", // Redirect errors back to login with ?error= param
  },

  providers: [
    // -------------------------------------------------------------------------
    // PROVIDER 1: Phone + Password (PRIMARY)
    //
    // Phone is the universal identifier in Rwanda; a password makes sign-in
    // free and instant. The alternative — an SMS code on every login — costs
    // real money per attempt and makes the SMS provider a single point of
    // failure for the entire platform: if Africa's Talking is down, nobody
    // can get in. A password removes both problems.
    //
    // An unverified phone is NOT a reason to refuse login. Verification gates
    // consequential actions (listing a car, confirming a booking) rather than
    // access to the account — see lib/auth.ts requirePhoneVerified().
    // -------------------------------------------------------------------------
    CredentialsProvider({
      id: "phone-password",
      name: "Phone & Password",
      credentials: {
        phone: { label: "Phone Number", type: "tel" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.phone || !credentials?.password) {
          throw new Error("MISSING_CREDENTIALS");
        }

        const phone = normalizeRwandaPhone(credentials.phone.trim());
        if (!phone) throw new Error("INVALID_CREDENTIALS");

        // Password guessing. Ten tries per number per fifteen minutes: enough
        // that nobody typing their own password badly notices, far too few to
        // work through a list. Keyed on the number rather than the caller,
        // because an attacker rotating addresses is the case that matters.
        const attempts = await rateLimit(`login:${phone}`, 10, 15 * 60 * 1000);
        if (!attempts.allowed) {
          throw new Error("TOO_MANY_ATTEMPTS");
        }

        const user = await prisma.user.findUnique({
          where: { phone },
          include: { subAdminProfile: true, carOwnerProfile: true },
        });

        // Same error whether the account is missing or the password is wrong,
        // so this endpoint cannot be used to enumerate who has an account.
        if (!user?.passwordHash) {
          // Burn comparable time so the response does not leak existence by
          // returning noticeably faster for an unknown number.
          await bcrypt.compare(credentials.password, DUMMY_HASH);
          throw new Error("INVALID_CREDENTIALS");
        }

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) throw new Error("INVALID_CREDENTIALS");

        // Getting in clears the counter — the limit is there to stop guessing,
        // not to punish someone who mistyped twice before succeeding.
        await prisma.rateLimit
          .deleteMany({ where: { key: `login:${phone}` } })
          .catch(() => {});

        if (user.isSuspended) throw new Error("ACCOUNT_SUSPENDED");

        return {
          id: user.id,
          phone: user.phone,
          email: user.email ?? null,
          name: user.name ?? null,
          role: user.role,
          isSuspended: user.isSuspended,
          isVerified: user.isVerified,
          roleModules: user.subAdminProfile?.roleModules ?? [],
          isOnboardingComplete:
            user.carOwnerProfile?.isOnboardingComplete ?? undefined,
        };
      },
    }),

    // -------------------------------------------------------------------------
    // PROVIDER 2: Phone + OTP (recovery, and pre-password accounts)
    // Still needed: password reset, and accounts created before passwords
    // existed. The OTP itself is generated and sent by /api/auth/otp.
    // -------------------------------------------------------------------------
    CredentialsProvider({
      id: "phone-otp",
      name: "Phone OTP",
      credentials: {
        phone: { label: "Phone Number", type: "tel" },
        otp: { label: "OTP Code", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.phone || !credentials?.otp) {
          throw new Error("MISSING_CREDENTIALS");
        }

        const phone = credentials.phone.trim();
        const otp = credentials.otp.trim();

        // Find user by phone — our primary identifier
        const user = await prisma.user.findUnique({
          where: { phone },
          include: {
            subAdminProfile: true,
            carOwnerProfile: true,
          },
        });

        if (!user) {
          throw new Error("USER_NOT_FOUND");
        }

        // Check for lockout — too many failed OTP attempts
        if (user.otpLockedUntil && user.otpLockedUntil > new Date()) {
          throw new Error("OTP_LOCKED");
        }

        // Check OTP exists and is not expired
        if (!user.otpCode || !user.otpExpiresAt) {
          throw new Error("OTP_NOT_FOUND");
        }

        if (user.otpExpiresAt < new Date()) {
          throw new Error("OTP_EXPIRED");
        }

        if (user.otpCode !== otp) {
          // Increment attempt counter — lock after 3 failures
          const newAttempts = (user.otpAttempts ?? 0) + 1;
          const maxAttempts = parseInt(process.env.OTP_MAX_ATTEMPTS ?? "3");
          const lockoutMinutes = parseInt(
            process.env.OTP_LOCKOUT_MINUTES ?? "15"
          );

          await prisma.user.update({
            where: { id: user.id },
            data: {
              otpAttempts: newAttempts,
              // Lock account after max attempts
              otpLockedUntil:
                newAttempts >= maxAttempts
                  ? new Date(Date.now() + lockoutMinutes * 60 * 1000)
                  : null,
            },
          });

          throw new Error(
            newAttempts >= maxAttempts ? "OTP_LOCKED" : "OTP_INVALID"
          );
        }

        // OTP valid — clear it immediately (single use)
        await prisma.user.update({
          where: { id: user.id },
          data: {
            otpCode: null,
            otpExpiresAt: null,
            otpAttempts: 0,
            otpLockedUntil: null,
          },
        });

        // Suspended users cannot log in
        if (user.isSuspended) {
          throw new Error("ACCOUNT_SUSPENDED");
        }

        // Return the user object — NextAuth will pass this to jwt() callback
        return {
          id: user.id,
          phone: user.phone,
          email: user.email ?? null,
          name: user.name ?? null,
          role: user.role,
          isSuspended: user.isSuspended,
          isVerified: user.isVerified,
          roleModules: user.subAdminProfile?.roleModules ?? [],
          isOnboardingComplete:
            user.carOwnerProfile?.isOnboardingComplete ?? undefined,
        };
      },
    }),

    // -------------------------------------------------------------------------
    // PROVIDER 3: Email + Password (mainly for admins)
    // Admins may prefer email login; some users set passwords during signup
    // -------------------------------------------------------------------------
    CredentialsProvider({
      id: "email-password",
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("MISSING_CREDENTIALS");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
          include: {
            subAdminProfile: true,
            carOwnerProfile: true,
          },
        });

        if (!user || !user.passwordHash) {
          throw new Error("INVALID_CREDENTIALS");
        }

        // Verify password using bcrypt (salt rounds: 12 as per spec)
        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!isPasswordValid) {
          throw new Error("INVALID_CREDENTIALS");
        }

        if (user.isSuspended) {
          throw new Error("ACCOUNT_SUSPENDED");
        }

        return {
          id: user.id,
          phone: user.phone,
          email: user.email ?? null,
          name: user.name ?? null,
          role: user.role,
          isSuspended: user.isSuspended,
          isVerified: user.isVerified,
          roleModules: user.subAdminProfile?.roleModules ?? [],
          isOnboardingComplete:
            user.carOwnerProfile?.isOnboardingComplete ?? undefined,
        };
      },
    }),
  ],

  callbacks: {
    // -------------------------------------------------------------------------
    // JWT CALLBACK
    // Called when JWT is created (sign in) or updated (session refresh)
    // We store our custom fields directly on the token
    // -------------------------------------------------------------------------
    async jwt({ token, user, trigger }) {
      // On initial sign-in, user object is populated — copy our fields to token
      if (user) {
        token.id = user.id;
        token.phone = user.phone;
        token.role = user.role as UserRole;
        token.isSuspended = user.isSuspended;
        token.isVerified = user.isVerified;
        token.roleModules = user.roleModules;
        token.isOnboardingComplete = user.isOnboardingComplete;
      }

      // ── Has this session been revoked? ────────────────────────────────────
      //
      // Sessions are stateless JWTs, so there is nothing to delete when a
      // password changes: every device already holding a token would keep it
      // for the full thirty days. User.sessionsValidFrom records the moment of
      // the change, and any token issued before it is refused here.
      //
      // This costs one indexed lookup per request. That is a real cost, and it
      // is the price of "change my password" meaning what people assume it
      // means — otherwise the phone someone left in a taxi keeps working for a
      // month after they have done the one thing they know to do about it.
      if (token.id && typeof token.iat === "number") {
        const record = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { sessionsValidFrom: true },
        });

        if (record?.sessionsValidFrom) {
          // iat is in seconds; allow a second of slack so the token issued by
          // the sign-in that follows a password change is not caught by it.
          const issuedAt = token.iat * 1000;
          if (issuedAt + 1000 < record.sessionsValidFrom.getTime()) {
            // Thrown rather than returned: this callback must return a JWT, and
            // throwing is already how a suspended account ends its session
            // further down.
            throw new Error("SESSION_REVOKED");
          }
        }
      }

      // On session update trigger (e.g. after profile change), re-fetch from DB
      // This ensures role/suspension changes take effect immediately
      if (trigger === "update" && token.id) {
        const freshUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          include: {
            subAdminProfile: true,
            carOwnerProfile: true,
          },
        });

        if (freshUser) {
          // If the user was suspended since last token refresh — invalidate session
          if (freshUser.isSuspended) {
            throw new Error("ACCOUNT_SUSPENDED");
          }

          token.role = freshUser.role;
          token.isSuspended = freshUser.isSuspended;
          token.isVerified = freshUser.isVerified;
          token.roleModules = freshUser.subAdminProfile?.roleModules ?? [];
          token.isOnboardingComplete =
            freshUser.carOwnerProfile?.isOnboardingComplete ?? undefined;
        }
      }

      return token;
    },

    // -------------------------------------------------------------------------
    // SESSION CALLBACK
    // Shapes what the client sees via useSession() or getServerSession()
    // Maps JWT fields → session.user
    // -------------------------------------------------------------------------
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.phone = token.phone;
        session.user.role = token.role;
        session.user.isSuspended = token.isSuspended;
        session.user.isVerified = token.isVerified;
        session.user.roleModules = token.roleModules;
        session.user.isOnboardingComplete = token.isOnboardingComplete;
      }
      return session;
    },
  },

  // Custom error handling — never expose raw errors to the client
  // Errors are mapped to codes that our UI translates to friendly messages
  events: {
    async signIn({ user }) {
      // Log successful sign-ins for security monitoring
      console.log(`[Auth] Sign in: ${user.id} (${user.phone})`);
    },
    async signOut({ token }) {
      console.log(`[Auth] Sign out: ${token?.id}`);
    },
  },
};
