/**
 * Phase 1 — direct settlement.
 *
 * ZuriDrive launches without processing payments: the renter pays the owner at
 * handover, and platform revenue comes from owner subscriptions. The payment
 * machinery still exists and is still tested elsewhere; it is simply dormant.
 *
 * The thing these tests protect is the LEDGER. It would be easy to write a
 * booking's real figures into Payment, Deposit and Commission rows "so the data
 * is there for later" — and that would be a lie the finance reports repeat.
 * Money the platform never received must not appear as money the platform
 * received. Every assertion below is a version of that one rule.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma, resetDatabase, disconnect } from "../helpers/db";
import { makeClient, makeOwner, makeCar, makeSettings } from "../helpers/factories";

let currentUser: { id: string; role?: string } | null = null;

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => (currentUser ? { user: currentUser } : null)),
}));

vi.mock("@/lib/sms", () => ({
  sendSms: vi.fn(async () => ({ success: true })),
  SMS_TEMPLATES: new Proxy({}, { get: () => () => "sms" }),
}));

const { POST: createBooking } = await import("@/app/api/bookings/route");

function req(body: unknown) {
  return new Request("http://test/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

async function bookingPayload(carId: string, overrides: Record<string, unknown> = {}) {
  const start = new Date(Date.now() + 7 * 86_400_000);
  const end = new Date(Date.now() + 10 * 86_400_000);

  return {
    carId,
    rentalType: "PER_DAY",
    tripScope: "IN_CITY",
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    withDriver: false,
    deliveryFee: 0,
    clientName: "Renter",
    clientPhone: "+250788000111",
    licenceAttested: true,
    paymentMethod: "DIRECT",
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDatabase();
  await makeSettings();
  currentUser = null;
  delete process.env.PAYMENT_PROVIDER;
});

afterAll(disconnect);

describe("the ledger never claims money we did not receive", () => {
  it("writes a payment row with ZERO amounts", async () => {
    const owner = await makeOwner();
    const car = await makeCar(owner.profile.id);
    const client = await makeClient();
    currentUser = { id: client.id, role: "CLIENT" };

    const res = await createBooking(req(await bookingPayload(car.id)));
    expect(res.status).toBe(200);

    const payment = await prisma.payment.findFirst({
      where: { booking: { clientId: client.id } },
    });

    expect(payment).not.toBeNull();
    expect(payment!.method).toBe("DIRECT");
    expect(payment!.rentalAmount).toBe(0);
    expect(payment!.depositAmount).toBe(0);
    expect(payment!.totalAmount).toBe(0);
  });

  it("creates NO deposit — the owner holds it, not us", async () => {
    const owner = await makeOwner();
    // Deposit deliberately enabled on the car - Phase 1 must still not hold it.
    const car = await makeCar(owner.profile.id, {}, { depositAmount: 80_000 });
    const client = await makeClient();
    currentUser = { id: client.id, role: "CLIENT" };

    await createBooking(req(await bookingPayload(car.id)));

    const deposits = await prisma.deposit.count();
    expect(deposits).toBe(0);
  });

  it("creates NO commission — revenue is subscriptions in Phase 1", async () => {
    const owner = await makeOwner();
    const car = await makeCar(owner.profile.id);
    const client = await makeClient();
    currentUser = { id: client.id, role: "CLIENT" };

    await createBooking(req(await bookingPayload(car.id)));

    expect(await prisma.commission.count()).toBe(0);
  });

  it("still records the agreed price on the booking", async () => {
    // Not collecting the money does not mean forgetting what was agreed —
    // both parties need to know the number they are settling on.
    const owner = await makeOwner();
    const car = await makeCar(owner.profile.id);
    const client = await makeClient();
    currentUser = { id: client.id, role: "CLIENT" };

    await createBooking(req(await bookingPayload(car.id)));

    const booking = await prisma.booking.findFirst({ where: { clientId: client.id } });
    expect(booking!.subtotal).toBeGreaterThan(0);
    expect(booking!.baseAmount).toBeGreaterThan(0);
  });
});

describe("booking status", () => {
  it("goes straight to the owner instead of waiting for payment", async () => {
    const owner = await makeOwner();
    const car = await makeCar(owner.profile.id);
    const client = await makeClient();
    currentUser = { id: client.id, role: "CLIENT" };

    await createBooking(req(await bookingPayload(car.id)));

    const booking = await prisma.booking.findFirst({ where: { clientId: client.id } });
    // PENDING_PAYMENT would strand every booking forever: nothing will ever
    // arrive to move it on, because nothing is being collected.
    expect(booking!.status).toBe("AWAITING_OWNER_CONFIRMATION");
  });
});

describe("the licence attestation", () => {
  it("is recorded when the renter confirms", async () => {
    const owner = await makeOwner();
    const car = await makeCar(owner.profile.id);
    const client = await makeClient();
    currentUser = { id: client.id, role: "CLIENT" };

    await createBooking(req(await bookingPayload(car.id, { licenceAttested: true })));

    const booking = await prisma.booking.findFirst({ where: { clientId: client.id } });
    expect(booking!.licenceAttestedAt).toBeInstanceOf(Date);
  });

  it("is REQUIRED — a booking without it is rejected", async () => {
    const owner = await makeOwner();
    const car = await makeCar(owner.profile.id);
    const client = await makeClient();
    currentUser = { id: client.id, role: "CLIENT" };

    const res = await createBooking(
      req(await bookingPayload(car.id, { licenceAttested: false })),
    );

    expect(res.status).toBe(400);
    expect(await prisma.booking.count()).toBe(0);
  });

  it("cannot be skipped by omitting the field", async () => {
    const owner = await makeOwner();
    const car = await makeCar(owner.profile.id);
    const client = await makeClient();
    currentUser = { id: client.id, role: "CLIENT" };

    const payload = await bookingPayload(car.id);
    delete (payload as Record<string, unknown>).licenceAttested;

    const res = await createBooking(req(payload));
    expect(res.status).toBe(400);
  });
});

describe("identity documents are not stored anywhere", () => {
  it("has no column that could hold them", async () => {
    // A schema-level assertion, deliberately. Code can be changed back; this
    // fails loudly if the columns are ever reintroduced.
    const columns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name IN ('users','bookings')`,
    );
    const names = columns.map((c) => c.column_name);

    for (const forbidden of [
      "nationalId",
      "licenseNumber",
      "licensePhoto",
      "guestNationalId",
      "guestLicenseNum",
      "guestLicensePhoto",
    ]) {
      expect(names, `${forbidden} must not exist`).not.toContain(forbidden);
    }
  });
});
