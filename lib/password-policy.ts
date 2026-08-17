/**
 * lib/password-policy.ts — one definition of what counts as an acceptable
 * password, shared by every route that accepts one.
 *
 * Two rules, and deliberately only two.
 *
 * Length does most of the real work, so the minimum is 8 and long passwords
 * are welcome — the maximum exists only because bcrypt silently truncates
 * beyond 72 bytes, and a limit that silently ignores the end of what someone
 * typed is worse than one that says no.
 *
 * The second rule rejects the handful of passwords that are guessed first.
 * Composition rules ("one uppercase, one symbol") are not used: they push
 * people towards Password1! and make nothing harder to guess.
 */

import { z } from "zod";

export const PASSWORD_MIN = 8;
/** bcrypt hashes only the first 72 bytes; beyond that the tail is ignored. */
export const PASSWORD_MAX = 72;

/**
 * Passwords that are tried first in any credential-stuffing attempt, plus the
 * ones this product invites specifically. Compared case-insensitively.
 */
const FORBIDDEN = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwertyui",
  "qwerty123",
  "11111111",
  "00000000",
  "iloveyou",
  "abc12345",
  "zuridrive",
  "zuridrive1",
  "zuridrive123",
]);

export function isForbiddenPassword(value: string): boolean {
  return FORBIDDEN.has(value.trim().toLowerCase());
}

/**
 * The shared schema. Route handlers use this rather than their own min/max so
 * the rule cannot drift between signup, owner signup and any future reset.
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN)
  .max(PASSWORD_MAX)
  .refine((v) => !isForbiddenPassword(v), {
    message: "That password is too easy to guess.",
  })
  // A password of only whitespace passes a length check and is a nightmare to
  // type twice the same way.
  .refine((v) => v.trim().length >= PASSWORD_MIN, {
    message: "Password cannot be mostly spaces.",
  });
