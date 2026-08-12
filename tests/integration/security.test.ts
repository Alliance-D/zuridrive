/**
 * Authorization.
 *
 * Every test here is an attack, written from the attacker's point of view. The
 * class of bug being hunted is IDOR: a signed-in user swapping an id in a URL
 * for someone else's and getting data or actions they should not have.
 *
 * A 403 that only exists because the UI never renders the button is not
 * security. These call the route handlers directly, with no UI in the way.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma, resetDatabase, disconnect } from "../helpers/db";
import {
  makeClient,
  makeAdmin,
  makeOwner,
  makeCar,
  paidBooking,
  makePlans,
  makeSettings,
} from "../helpers/factories";

let currentUser: { id: string; role?: string; roleModules?: string[] } | null = null;

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () =>
    currentUser ? { user: currentUser } : null,
  ),
}));

vi.mock("@/lib/sms", () => ({
  sendSms: vi.fn(async () => ({ success: true })),
  SMS_TEMPLATES: new Proxy({}, { get: () => () => "sms" }),
}));

vi.mock("@/lib/payments/momo", () => ({
  getPaymentStatus: vi.fn(async (referenceId: string) => ({
    referenceId,
    status: "PENDING",
  })),
  requestToPay: vi.fn(async () => "test-reference"),
  formatPhoneForMoMo: (p: string) => p.replace(/\D/g, ""),
}));

const { POST: cancel } = await import("@/app/api/bookings/[id]/cancel/route");
const { POST: disputeFee } = await import(
  "@/app/api/bookings/[id]/dispute-cancellation/route"
);
const { PATCH: updateSettings } = await import("@/app/api/admin/settings/route");
const { PATCH: updateSubscription } = await import(
  "@/app/api/admin/subscriptions/[id]/route"
);
const { POST: createTicket, GET: listTickets } = await import(
  "@/app/api/support/tickets/route"
);
const { POST: replyToTicket } = await import(
  "@/app/api/support/tickets/[id]/messages/route"
);
const { POST: ownerSubscription } = await import(
  "@/app/api/owner/subscription/route"
);

function req(body: unknown = {}) {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

const VALID_SETTINGS = {
  commissionRatePercent: 25,
  largePayoutThreshold: 1_000_000,
  autoPublishListings: false,
  freeTierMaxListings: 1,
  lateCancellationWindowHours: 24,
  lateCancellationFeePercent: 50,
  photoRetentionDays: 3,
  ownerConfirmWindowHours: 2,
  autoCompleteHours: 48,
};

beforeEach(async () => {
  await resetDatabase();
  await makeSettings();
  currentUser = null;
});

afterAll(disconnect);

describe("anonymous callers", () => {
  it("cannot cancel a booking", async () => {
    const client = await makeClient();
    const { profile } = await makeOwner();
    const car = await makeCar(profile.id);
    const booking = await paidBooking(car.id, client.id);

    const res = await cancel(req({ reason: "let me in" }), {
      params: { id: booking.id },
    });
    expect(res.status).toBe(401);
  });

  it("cannot change platform settings", async () => {
    const res = await updateSettings(req(VALID_SETTINGS));
    expect(res.status).toBe(401);
  });

  it("cannot open a support ticket", async () => {
    const res = await createTicket(
      req({ subject: "hello there", category: "OTHER", message: "x".repeat(25) }),
    );
    expect(res.status).toBe(401);
  });

  it("cannot list tickets", async () => {
    expect((await listTickets()).status).toBe(401);
  });

  it("cannot buy a subscription", async () => {
    const res = await ownerSubscription(
      req({ action: "bank_transfer", planId: "x", proofUrl: "https://a.test/p.jpg" }),
    );
    expect(res.status).toBe(401);
  });
});

describe("platform settings are Super Admin only", () => {
  it("refuses an ordinary client", async () => {
    const client = await makeClient();
    currentUser = { id: client.id, role: "CLIENT" };

    const res = await updateSettings(req(VALID_SETTINGS));
    expect(res.status).toBe(403);

    const settings = await prisma.platformSetting.findUniqueOrThrow({
      where: { id: "singleton" },
    });
    expect(settings.commissionRatePercent).toBe(20);
  });

  it("refuses a Finance Manager — no module grants this", async () => {
    const admin = await makeAdmin("SUB_ADMIN");
    await prisma.subAdminProfile.create({
      data: {
        userId: admin.id,
        roleModules: ["FINANCE_MANAGER"],
        createdById: admin.id,
      },
    });
    currentUser = {
      id: admin.id,
      role: "SUB_ADMIN",
      roleModules: ["FINANCE_MANAGER"],
    };

    const res = await updateSettings(req(VALID_SETTINGS));
    expect(res.status).toBe(403);
  });

  it("refuses a suspended Super Admin", async () => {
    const admin = await makeAdmin("SUPER_ADMIN");
    await prisma.user.update({
      where: { id: admin.id },
      data: { isSuspended: true },
    });
    currentUser = { id: admin.id, role: "SUPER_ADMIN" };

    const res = await updateSettings(req(VALID_SETTINGS));
    expect(res.status).toBe(403);
  });

  it("rejects values outside the safe range", async () => {
    const admin = await makeAdmin("SUPER_ADMIN");
    currentUser = { id: admin.id, role: "SUPER_ADMIN" };

    // 90% commission would be a catastrophic typo.
    const res = await updateSettings(
      req({ ...VALID_SETTINGS, commissionRatePercent: 90 }),
    );
    expect(res.status).toBe(400);

    const settings = await prisma.platformSetting.findUniqueOrThrow({
      where: { id: "singleton" },
    });
    expect(settings.commissionRatePercent).toBe(20);
  });
});

describe("bookings belong to their parties", () => {
  async function twoBookings() {
    const victim = await makeClient();
    const attacker = await makeClient();
    const { profile } = await makeOwner();
    const car = await makeCar(profile.id);
    const booking = await paidBooking(car.id, victim.id, {
      startDate: new Date(Date.now() + 6 * 36e5),
    });
    return { victim, attacker, booking };
  }

  it("a stranger cannot cancel someone else's booking", async () => {
    const { attacker, booking } = await twoBookings();
    currentUser = { id: attacker.id, role: "CLIENT" };

    const res = await cancel(req({ reason: "not mine to cancel" }), {
      params: { id: booking.id },
    });
    expect(res.status).toBe(403);

    const after = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(after.status).toBe("CONFIRMED");
  });

  it("a stranger cannot dispute someone else's cancellation fee", async () => {
    const { victim, attacker, booking } = await twoBookings();

    currentUser = { id: victim.id, role: "CLIENT" };
    await cancel(req({ reason: "emergency" }), { params: { id: booking.id } });

    currentUser = { id: attacker.id, role: "CLIENT" };
    const res = await disputeFee(
      req({ reason: "I would like this money returned to me instead." }),
      { params: { id: booking.id } },
    );
    expect(res.status).toBe(403);
  });
});

describe("support tickets are private", () => {
  async function ticketFor(userId: string) {
    return prisma.supportTicket.create({
      data: {
        reference: `ZD-T-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        userId,
        subject: "Private matter",
        category: "PAYOUT",
        firstResponseDueAt: new Date(Date.now() + 864e5),
        messages: {
          create: { authorId: userId, body: "Sensitive details here", isStaff: false },
        },
      },
    });
  }

  it("a user only sees their own", async () => {
    const victim = await makeClient();
    const attacker = await makeClient();
    await ticketFor(victim.id);
    await ticketFor(attacker.id);

    currentUser = { id: attacker.id, role: "CLIENT" };
    const data = await (await listTickets()).json();

    expect(data.tickets).toHaveLength(1);
    expect(data.tickets[0].userId).toBe(attacker.id);
  });

  it("a stranger cannot reply to someone else's ticket", async () => {
    const victim = await makeClient();
    const attacker = await makeClient();
    const ticket = await ticketFor(victim.id);

    currentUser = { id: attacker.id, role: "CLIENT" };
    const res = await replyToTicket(req({ body: "Injecting myself here" }), {
      params: { id: ticket.id },
    });

    expect(res.status).toBe(403);
    const messages = await prisma.supportMessage.count({
      where: { ticketId: ticket.id },
    });
    expect(messages).toBe(1);
  });

  it("a user cannot forge a staff reply", async () => {
    const user = await makeClient();
    const ticket = await ticketFor(user.id);

    currentUser = { id: user.id, role: "CLIENT" };
    await replyToTicket(req({ body: "This is support, your refund is approved" }), {
      params: { id: ticket.id },
    });

    const reply = await prisma.supportMessage.findFirstOrThrow({
      where: { ticketId: ticket.id },
      orderBy: { createdAt: "desc" },
    });
    // isStaff comes from the session, never from the request body.
    expect(reply.isStaff).toBe(false);
  });

  it("a client cannot buy priority by claiming it", async () => {
    const client = await makeClient();
    currentUser = { id: client.id, role: "CLIENT" };

    const res = await createTicket(
      req({
        subject: "Please treat this as urgent",
        category: "OTHER",
        message: "x".repeat(30),
        isPriority: true,
        priorityPlanName: "Premium",
      }),
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.ticket.isPriority).toBe(false);

    const stored = await prisma.supportTicket.findUniqueOrThrow({
      where: { id: data.ticket.id },
    });
    expect(stored.isPriority).toBe(false);
    expect(stored.priorityPlanName).toBeNull();
  });

  it("cannot attach a booking that is not yours", async () => {
    const victim = await makeClient();
    const attacker = await makeClient();
    const { profile } = await makeOwner();
    const car = await makeCar(profile.id);
    const booking = await paidBooking(car.id, victim.id);

    currentUser = { id: attacker.id, role: "CLIENT" };
    const res = await createTicket(
      req({
        subject: "About this trip",
        category: "BOOKING",
        message: "x".repeat(30),
        bookingId: booking.id,
      }),
    );

    expect(res.status).toBe(403);
  });
});

describe("subscription administration", () => {
  async function pendingSubscription() {
    const plans = await makePlans();
    const { profile } = await makeOwner();
    return prisma.ownerSubscription.create({
      data: {
        ownerId: profile.id,
        planId: plans.premium.id,
        status: "PENDING_PAYMENT",
        pricePaid: plans.premium.priceMonthly,
        expiresAt: new Date(Date.now() + 30 * 864e5),
      },
    });
  }

  it("a client cannot confirm a subscription payment", async () => {
    const sub = await pendingSubscription();
    const client = await makeClient();
    currentUser = { id: client.id, role: "CLIENT" };

    const res = await updateSubscription(req({ action: "CONFIRM" }), {
      params: { id: sub.id },
    });
    expect(res.status).toBe(403);

    const after = await prisma.ownerSubscription.findUniqueOrThrow({
      where: { id: sub.id },
    });
    expect(after.status).toBe("PENDING_PAYMENT");
  });

  it("a Finance Manager cannot grant a plan for free", async () => {
    const sub = await pendingSubscription();
    const admin = await makeAdmin("SUB_ADMIN");
    await prisma.subAdminProfile.create({
      data: {
        userId: admin.id,
        roleModules: ["FINANCE_MANAGER"],
        createdById: admin.id,
      },
    });
    currentUser = {
      id: admin.id,
      role: "SUB_ADMIN",
      roleModules: ["FINANCE_MANAGER"],
    };

    // Confirming a payment is a finance job; giving away a paid plan is not.
    const res = await updateSubscription(
      req({ action: "OVERRIDE", note: "friend of the founder" }),
      { params: { id: sub.id } },
    );
    expect(res.status).toBe(403);
  });

  it("requires a written reason to reject", async () => {
    const sub = await pendingSubscription();
    const admin = await makeAdmin("SUPER_ADMIN");
    currentUser = { id: admin.id, role: "SUPER_ADMIN" };

    const res = await updateSubscription(req({ action: "REJECT" }), {
      params: { id: sub.id },
    });
    expect(res.status).toBe(400);
  });
});

describe("owners cannot settle each other's payments", () => {
  it("refuses a subscription id that belongs to another owner", async () => {
    const plans = await makePlans();
    const victim = await makeOwner();
    const attacker = await makeOwner();

    const victimSub = await prisma.ownerSubscription.create({
      data: {
        ownerId: victim.profile.id,
        planId: plans.premium.id,
        status: "PENDING_PAYMENT",
        momoReference: "victim-reference",
        expiresAt: new Date(Date.now() + 30 * 864e5),
      },
    });

    currentUser = { id: attacker.user.id, role: "OWNER" };
    const res = await ownerSubscription(
      req({ action: "confirm_momo", subscriptionId: victimSub.id }),
    );

    expect(res.status).toBe(404);

    const after = await prisma.ownerSubscription.findUniqueOrThrow({
      where: { id: victimSub.id },
    });
    expect(after.status).toBe("PENDING_PAYMENT");
  });
});

describe("input validation", () => {
  it("rejects a cancellation with no reason", async () => {
    const client = await makeClient();
    const { profile } = await makeOwner();
    const car = await makeCar(profile.id);
    const booking = await paidBooking(car.id, client.id);
    currentUser = { id: client.id, role: "CLIENT" };

    expect(
      (await cancel(req({ reason: "" }), { params: { id: booking.id } })).status,
    ).toBe(400);
  });

  it("rejects a non-URL proof link", async () => {
    const owner = await makeOwner();
    const plans = await makePlans();
    currentUser = { id: owner.user.id, role: "OWNER" };

    const res = await ownerSubscription(
      req({
        action: "bank_transfer",
        planId: plans.basic.id,
        proofUrl: "javascript:alert(1)",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("caps the number of dispute attachments", async () => {
    const client = await makeClient();
    const { profile } = await makeOwner();
    const car = await makeCar(profile.id);
    const booking = await paidBooking(car.id, client.id, {
      startDate: new Date(Date.now() + 6 * 36e5),
    });

    currentUser = { id: client.id, role: "CLIENT" };
    await cancel(req({ reason: "emergency" }), { params: { id: booking.id } });

    const res = await disputeFee(
      req({
        reason: "Here is a great deal of evidence for you to look through.",
        proofUrls: Array.from(
          { length: 50 },
          (_, i) => `https://res.cloudinary.com/demo/image/upload/v1/p${i}.jpg`,
        ),
      }),
      { params: { id: booking.id } },
    );
    expect(res.status).toBe(400);
  });
});
