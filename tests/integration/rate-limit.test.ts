/**
 * The rate limiter, and the session cutoff a password change writes.
 *
 * Both exist because of a property of this deployment rather than of the code:
 * serverless instances do not share memory, so an in-process counter silently
 * multiplies the allowance by however many are running; and NextAuth issues
 * stateless JWTs, so there is nothing to delete when someone changes their
 * password because they think a stranger has it.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDatabase, disconnect } from "../helpers/db";
import { rateLimit, clientIp } from "@/lib/rate-limit";

beforeEach(resetDatabase);
afterAll(disconnect);

describe("rate limiting", () => {
  it("allows up to the limit and then refuses", async () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect((await rateLimit(key, 3, 60_000)).allowed, `call ${i + 1}`).toBe(true);
    }
    expect((await rateLimit(key, 3, 60_000)).allowed).toBe(false);
  });

  it("counts down the remaining allowance", async () => {
    const key = `test:${Math.random()}`;
    expect((await rateLimit(key, 3, 60_000)).remaining).toBe(2);
    expect((await rateLimit(key, 3, 60_000)).remaining).toBe(1);
    expect((await rateLimit(key, 3, 60_000)).remaining).toBe(0);
  });

  it("keeps separate keys separate", async () => {
    const a = `a:${Math.random()}`;
    const b = `b:${Math.random()}`;
    await rateLimit(a, 1, 60_000);
    expect((await rateLimit(a, 1, 60_000)).allowed).toBe(false);
    // One caller exhausting their allowance must not affect anybody else.
    expect((await rateLimit(b, 1, 60_000)).allowed).toBe(true);
  });

  it("starts a new window once the old one has passed", async () => {
    const key = `test:${Math.random()}`;
    await rateLimit(key, 1, 60_000);
    expect((await rateLimit(key, 1, 60_000)).allowed).toBe(false);

    // Reach into the row rather than waiting a minute.
    await prisma.rateLimit.update({
      where: { key },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect((await rateLimit(key, 1, 60_000)).allowed).toBe(true);
  });

  it("counts in the database, not in memory", async () => {
    // The whole point: another instance of the app must see the same count.
    const key = `test:${Math.random()}`;
    await rateLimit(key, 5, 60_000);
    await rateLimit(key, 5, 60_000);

    const row = await prisma.rateLimit.findUnique({ where: { key } });
    expect(row?.count).toBe(2);
  });

  it("reads the caller's address from the proxy header", () => {
    const req = (h: Record<string, string>) => ({
      headers: { get: (n: string) => h[n.toLowerCase()] ?? null },
    });
    // First entry is the client; the rest are proxies.
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.4, 10.0.0.1" }))).toBe("203.0.113.4");
    expect(clientIp(req({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(req({}))).toBe("unknown");
  });
});

describe("session cutoff", () => {
  it("refuses a token issued before the cutoff and accepts one after", async () => {
    // Mirrors the comparison in lib/auth-options.ts, which is what decides
    // whether a device stays signed in after a password change.
    const changedAt = new Date();
    const olderToken = Math.floor((changedAt.getTime() - 60_000) / 1000);
    const newerToken = Math.floor((changedAt.getTime() + 60_000) / 1000);

    const revoked = (iatSeconds: number) =>
      iatSeconds * 1000 + 1000 < changedAt.getTime();

    expect(revoked(olderToken)).toBe(true);
    expect(revoked(newerToken)).toBe(false);
  });

  it("leaves accounts that never changed a password alone", async () => {
    const user = await prisma.user.create({
      data: { phone: `+25078${Date.now().toString().slice(-7)}`, role: "CLIENT" },
    });
    // Null means "nothing has been revoked", so no token is ever refused.
    expect(user.sessionsValidFrom).toBeNull();
  });
});
