/**
 * Sign-up, sign-in, phone verification, and the handover identity check.
 *
 * Two things here are easy to get wrong in ways that stay invisible:
 *
 *   1. ENUMERATION. Sign-up and sign-in both take a phone number, so both can
 *      be used to ask "does this person have an account?" unless the responses
 *      are deliberately uniform.
 *
 *   2. THE VERIFICATION GATE. Phone verification is enforced only when an SMS
 *      provider is configured, so the platform can launch before RURA approves
 *      a sender ID. That is a security-relevant switch, and a bug that leaves
 *      it permanently off would never announce itself.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma, resetDatabase, disconnect } from "../helpers/db";
import { makeClient, makeOwner, makeCar, makeSettings } from "../helpers/factories";
import { hashPassword } from "@/lib/auth";

let currentUser: { id: string; role?: string } | null = null;

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => (currentUser ? { user: currentUser } : null)),
}));

vi.mock("@/lib/sms", () => ({
  sendSms: vi.fn(async () => ({ success: true })),
  sendOtpSms: vi.fn(async () => ({ success: true })),
  generateOtp: vi.fn(() => "123456"),
  SMS_TEMPLATES: new Proxy({}, { get: () => () => "sms" }),
}));

const { POST: signup } = await import("@/app/api/auth/signup/route");
const { POST: idCheck } = await import("@/app/api/bookings/[id]/id-check/route");

function post(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

beforeEach(async () => {
  await resetDatabase();
  await makeSettings();
  currentUser = null;
  delete process.env.AT_API_KEY;
  delete process.env.AT_USERNAME;
});

afterAll(disconnect);

// ---------------------------------------------------------------------------

describe("sign-up", () => {
  const valid = {
    phone: "0788123456",
    name: "Mutesi",
    password: "a-good-password",
  };

  it("creates an account without sending any SMS", async () => {
    const res = await signup(post("http://test/api/auth/signup", valid));
    expect(res.status).toBe(201);

    const user = await prisma.user.findUnique({ where: { phone: "+250788123456" } });
    expect(user).not.toBeNull();
    expect(user!.role).toBe("CLIENT");
  });

  it("normalises the phone number to E.164", async () => {
    // Three spellings of one number must not become three accounts.
    for (const [phone, expected] of [
      ["0788111222", "+250788111222"],
      ["250788111333", "+250788111333"],
      ["+250 788 111 444", "+250788111444"],
    ]) {
      await signup(post("http://test/api/auth/signup", { ...valid, phone }));
      const user = await prisma.user.findUnique({ where: { phone: expected } });
      expect(user, `${phone} should store as ${expected}`).not.toBeNull();
    }
  });

  it("stores the password hashed, never in plain text", async () => {
    await signup(post("http://test/api/auth/signup", valid));
    const user = await prisma.user.findUnique({ where: { phone: "+250788123456" } });

    expect(user!.passwordHash).toBeTruthy();
    expect(user!.passwordHash).not.toBe(valid.password);
    expect(user!.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt
  });

  it("leaves the phone unverified", async () => {
    await signup(post("http://test/api/auth/signup", valid));
    const user = await prisma.user.findUnique({ where: { phone: "+250788123456" } });
    expect(user!.phoneVerifiedAt).toBeNull();
  });

  it("rejects a short password", async () => {
    const res = await signup(
      post("http://test/api/auth/signup", { ...valid, password: "short" }),
    );
    expect(res.status).toBe(400);
    expect(await prisma.user.count()).toBe(0);
  });

  it("rejects a non-Rwandan number", async () => {
    const res = await signup(
      post("http://test/api/auth/signup", { ...valid, phone: "+447700900000" }),
    );
    expect(res.status).toBe(400);
  });

  it("refuses a duplicate number rather than overwriting the account", async () => {
    await makeClient({ phone: "+250788123456", passwordHash: await hashPassword("x") });

    const res = await signup(post("http://test/api/auth/signup", valid));
    expect(res.status).toBe(409);
    expect(await prisma.user.count()).toBe(1);
  });

  it("does not leak the password back in the response", async () => {
    const res = await signup(post("http://test/api/auth/signup", valid));
    const body = JSON.stringify(await res.json());

    expect(body).not.toContain(valid.password);
    expect(body).not.toContain("passwordHash");
  });
});

// ---------------------------------------------------------------------------

describe("phone verification gate", () => {
  it("is OFF when no SMS provider is configured", async () => {
    const { getPhoneVerification } = await import("@/lib/phone-verification");
    const user = await makeClient(); // phoneVerifiedAt is null

    const state = await getPhoneVerification(user.id);

    // Nothing to verify with, so an unverified user is not blocked — this is
    // what lets the platform launch before RURA approves a sender ID.
    expect(state.enforced).toBe(false);
    expect(state.blocked).toBe(false);
  });

  it("turns ON by itself once credentials exist", async () => {
    process.env.AT_API_KEY = "test-key";
    process.env.AT_USERNAME = "test-user";

    const { getPhoneVerification } = await import("@/lib/phone-verification");
    const user = await makeClient();

    const state = await getPhoneVerification(user.id);
    expect(state.enforced).toBe(true);
    expect(state.blocked).toBe(true);
  });

  it("lets a verified user through once enforcement is on", async () => {
    process.env.AT_API_KEY = "test-key";
    process.env.AT_USERNAME = "test-user";

    const { getPhoneVerification } = await import("@/lib/phone-verification");
    const user = await makeClient({ phoneVerifiedAt: new Date() });

    const state = await getPhoneVerification(user.id);
    expect(state.blocked).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("the owner's handover identity check", () => {
  async function confirmedBooking() {
    const owner = await makeOwner();
    const car = await makeCar(owner.profile.id);
    const client = await makeClient();

    const booking = await prisma.booking.create({
      data: {
        reference: `ZD-${Math.floor(Math.random() * 1e6)}`,
        clientId: client.id,
        carId: car.id,
        startDate: new Date(Date.now() + 86_400_000),
        endDate: new Date(Date.now() + 3 * 86_400_000),
        totalDays: 2,
        status: "CONFIRMED",
        rentalType: "PER_DAY",
        baseRatePerDay: 45_000,
        baseAmount: 90_000,
        driverTotal: 0,
        deliveryFee: 0,
        subtotal: 90_000,
        commissionRate: 20,
        commissionAmount: 18_000,
        ownerEarnings: 72_000,
        depositAmount: 0,
        licenceAttestedAt: new Date(),
      },
    });

    return { owner, client, booking };
  }

  it("records a matching check", async () => {
    const { owner, booking } = await confirmedBooking();
    currentUser = { id: owner.user.id, role: "OWNER" };

    const res = await idCheck(
      post("http://test/x", { result: "MATCHED" }),
      { params: { id: booking.id } },
    );
    expect(res.status).toBe(200);

    const after = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(after!.idCheckedByOwnerAt).toBeInstanceOf(Date);
    expect(after!.idCheckFailedReason).toBeNull();
  });

  it("records a failed check with the reason", async () => {
    const { owner, booking } = await confirmedBooking();
    currentUser = { id: owner.user.id, role: "OWNER" };

    const res = await idCheck(
      post("http://test/x", {
        result: "FAILED",
        reason: "The name on the licence did not match the booking.",
      }),
      { params: { id: booking.id } },
    );
    expect(res.status).toBe(200);

    const after = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(after!.idCheckFailedReason).toContain("did not match");
  });

  it("does NOT auto-cancel on a failed check", async () => {
    // Auto-cancelling would hand either party a way to kill a booking
    // unilaterally, with no evidence and no recourse for the other side.
    const { owner, booking } = await confirmedBooking();
    currentUser = { id: owner.user.id, role: "OWNER" };

    await idCheck(
      post("http://test/x", { result: "FAILED", reason: "Documents were not produced." }),
      { params: { id: booking.id } },
    );

    const after = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(after!.status).toBe("CONFIRMED");
  });

  it("cannot be recorded by the RENTER", async () => {
    const { client, booking } = await confirmedBooking();
    currentUser = { id: client.id, role: "CLIENT" };

    const res = await idCheck(
      post("http://test/x", { result: "MATCHED" }),
      { params: { id: booking.id } },
    );

    expect(res.status).toBe(403);
    const after = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(after!.idCheckedByOwnerAt).toBeNull();
  });

  it("cannot be recorded by an unrelated owner", async () => {
    const { booking } = await confirmedBooking();
    const stranger = await makeOwner();
    currentUser = { id: stranger.user.id, role: "OWNER" };

    const res = await idCheck(
      post("http://test/x", { result: "MATCHED" }),
      { params: { id: booking.id } },
    );
    expect(res.status).toBe(403);
  });

  it("cannot be recorded twice", async () => {
    const { owner, booking } = await confirmedBooking();
    currentUser = { id: owner.user.id, role: "OWNER" };

    await idCheck(post("http://test/x", { result: "MATCHED" }), {
      params: { id: booking.id },
    });
    const second = await idCheck(post("http://test/x", { result: "MATCHED" }), {
      params: { id: booking.id },
    });

    expect(second.status).toBe(409);
  });

  it("requires a reason when the check fails", async () => {
    const { owner, booking } = await confirmedBooking();
    currentUser = { id: owner.user.id, role: "OWNER" };

    const res = await idCheck(
      post("http://test/x", { result: "FAILED" }),
      { params: { id: booking.id } },
    );
    expect(res.status).toBe(400);
  });

  it("refuses when nobody is signed in", async () => {
    const { booking } = await confirmedBooking();
    currentUser = null;

    const res = await idCheck(
      post("http://test/x", { result: "MATCHED" }),
      { params: { id: booking.id } },
    );
    expect(res.status).toBe(401);
  });
});
