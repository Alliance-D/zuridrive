// =============================================================================
// ZuriDrive — Phone verification policy
//
// Verification is a GATE ON ACTIONS, not a gate on access.
//
// Signing in with an unverified number is fine — you can browse, edit your
// profile, and look at cars. What needs a proven number is anything where
// somebody else is relying on being able to reach you:
//
//   • listing a car        — renters must be able to call the owner
//   • confirming a booking — both parties need a working number for handover
//
// WHY IT IS OPTIONAL
// Sending SMS in Rwanda needs an Africa's Talking account and a RURA-approved
// sender ID, and that approval takes weeks. Blocking launch on it would be
// absurd, so when no SMS provider is configured the platform runs in trust
// mode: accounts are treated as verified and nothing is sent.
//
// Configure AT_API_KEY and AT_USERNAME and enforcement switches on by itself.
// No code change, no migration, no redeploy of anything but the env vars.
// =============================================================================

import { prisma } from "@/lib/db";

/**
 * Is there an SMS provider configured at all?
 *
 * Both values are needed to send anything, so either being absent means the
 * platform physically cannot verify a number — and refusing to let owners list
 * cars because of our own missing configuration would be punishing them for it.
 */
export function smsProviderConfigured(): boolean {
  return Boolean(process.env.AT_API_KEY && process.env.AT_USERNAME);
}

/** Verification is only enforced when we are actually able to verify. */
export function phoneVerificationEnforced(): boolean {
  return smsProviderConfigured();
}

export interface VerificationState {
  verified: boolean;
  /** False while the platform is running without an SMS provider. */
  enforced: boolean;
  /** True when the user must verify before the action can proceed. */
  blocked: boolean;
}

export async function getPhoneVerification(
  userId: string,
): Promise<VerificationState> {
  const enforced = phoneVerificationEnforced();

  if (!enforced) {
    return { verified: true, enforced: false, blocked: false };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phoneVerifiedAt: true },
  });

  const verified = user?.phoneVerifiedAt !== null && user?.phoneVerifiedAt !== undefined;
  return { verified, enforced, blocked: !verified };
}

/**
 * Throws when a user must verify before continuing.
 * Route handlers catch this and turn it into a 403 with the message shown.
 */
export class PhoneVerificationRequired extends Error {
  constructor() {
    super(
      "Please confirm your phone number before continuing — we'll send you a code.",
    );
    this.name = "PhoneVerificationRequired";
  }
}

/** Guard for the consequential actions listed at the top of this file. */
export async function requirePhoneVerified(userId: string): Promise<void> {
  const state = await getPhoneVerification(userId);
  if (state.blocked) throw new PhoneVerificationRequired();
}

/** Marks a number proven. Called by the verify-otp route on success. */
export async function markPhoneVerified(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { phoneVerifiedAt: new Date() },
  });
}
