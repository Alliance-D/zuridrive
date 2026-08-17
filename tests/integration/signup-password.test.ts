/**
 * Signing up sets a password, and that password is what signs you in.
 *
 * These two flows were built on opposite assumptions and contradicted each
 * other: signup created a passwordless account "because the platform signs
 * people in with a one-time code", while the login page asked for a password
 * by default. Anyone who registered was then told to enter a credential they
 * had never been given.
 *
 * The failure was invisible to every check in the repo — both halves worked
 * exactly as written. Only using them together showed it.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDatabase, disconnect } from "../helpers/db";
import { phone as newPhone } from "../helpers/factories";
import { verifyPassword, hashPassword } from "@/lib/auth";
import { passwordSchema, isForbiddenPassword } from "@/lib/password-policy";

beforeEach(resetDatabase);
afterAll(disconnect);

describe("password policy", () => {
  it("requires at least eight characters", () => {
    expect(passwordSchema.safeParse("short12").success).toBe(false);
    expect(passwordSchema.safeParse("longenough1").success).toBe(true);
  });

  it("rejects the passwords guessed first", () => {
    for (const bad of ["password", "PASSWORD123", "12345678", "zuridrive"]) {
      expect(passwordSchema.safeParse(bad).success, bad).toBe(false);
      expect(isForbiddenPassword(bad), bad).toBe(true);
    }
  });

  it("rejects a password that is mostly spaces", () => {
    expect(passwordSchema.safeParse("          ").success).toBe(false);
  });

  it("stops at 72 bytes, where bcrypt silently truncates", () => {
    // Accepting more would mean quietly ignoring the end of what was typed,
    // so two different passwords could open the same account.
    expect(passwordSchema.safeParse("a".repeat(72)).success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(73)).success).toBe(false);
  });
});

describe("stored passwords", () => {
  it("never stores the password itself", async () => {
    const plain = "correct-horse-8";
    const user = await prisma.user.create({
      data: {
        phone: newPhone(),
        name: "Test Person",
        role: "CLIENT",
        passwordHash: await hashPassword(plain),
      },
    });

    expect(user.passwordHash).not.toBe(plain);
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt
    expect(await verifyPassword(plain, user.passwordHash!)).toBe(true);
    expect(await verifyPassword("wrong-password-9", user.passwordHash!)).toBe(false);
  });

  it("gives two identical passwords different hashes", async () => {
    // Salted, so a leaked table cannot be scanned for shared passwords.
    const a = await hashPassword("correct-horse-8");
    const b = await hashPassword("correct-horse-8");
    expect(a).not.toBe(b);
    expect(await verifyPassword("correct-horse-8", a)).toBe(true);
    expect(await verifyPassword("correct-horse-8", b)).toBe(true);
  });
});

describe("accounts that predate passwords", () => {
  it("can still exist, and are not signed in by an empty password", async () => {
    // Guest bookings and every account created before signup asked for one.
    // They keep the code route in; what must never happen is a blank or
    // arbitrary password being accepted because the hash is null.
    const user = await prisma.user.create({
      data: { phone: newPhone(), name: "Older Account", role: "CLIENT" },
    });

    expect(user.passwordHash).toBeNull();
    // There is nothing to compare against, so any check must fail rather than
    // pass vacuously.
    await expect(
      (async () => verifyPassword("", user.passwordHash ?? ""))(),
    ).resolves.toBe(false);
  });
});
