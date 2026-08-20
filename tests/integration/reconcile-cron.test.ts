/**
 * The nightly books-balance check.
 *
 * The check itself already existed and was correct. What was missing was that
 * nothing ran it: it executed only when an admin opened the finance reports
 * page, so it answered "are my books balanced?" only for someone who had
 * already thought to ask. A safety net you have to hold up yourself is not
 * catching anything.
 *
 * These cover the two things the cron adds — that it runs under the cron
 * secret and nobody else, and that a discrepancy actually reaches a person.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma, resetDatabase, disconnect } from "../helpers/db";
import { makeOwner, makeCar, makeClient, makeAdmin, paidBooking, makeSettings } from "../helpers/factories";

process.env.CRON_SECRET = "test-cron-secret";

const { GET } = await import("@/app/api/cron/reconcile/route");

function request(secret?: string) {
  return new Request("http://test/api/cron/reconcile", {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

beforeEach(async () => {
  await resetDatabase();
  await makeSettings();
});

afterAll(disconnect);

describe("reconciliation cron", () => {
  it("refuses a caller without the cron secret", async () => {
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("refuses a caller with the wrong secret", async () => {
    const res = await GET(request("not-the-secret"));
    expect(res.status).toBe(401);
  });

  it("records a run even when everything balances", async () => {
    const res = await GET(request("test-cron-secret"));
    const body = await res.json();

    expect(body.balanced).toBe(true);

    // A clean run is evidence too — it is what lets you say afterwards that
    // the books balanced that night, rather than that nobody looked.
    const logs = await prisma.reconciliationLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].hasMismatch).toBe(false);
  });

  it("stays quiet when the books balance", async () => {
    await GET(request("test-cron-secret"));

    // An alert every morning saying "all correct" is an alert people stop
    // reading, and then miss the one that matters.
    const alerts = await prisma.notification.findMany({
      where: { type: "RECONCILIATION_MISMATCH" },
    });
    expect(alerts).toHaveLength(0);
  });

  it("alerts finance when money is unaccounted for", async () => {
    // Somebody has to be on the receiving end, or "it alerts" is untestable.
    await makeAdmin("SUPER_ADMIN");

    // A commission recorded against no payment: the platform's books claim
    // income that never arrived.
    const owner = await makeOwner();
    const client = await makeClient();
    const car = await makeCar(owner.profile.id);
    const booking = await paidBooking(car.id, client.id, { status: "COMPLETED" });

    await prisma.commission.deleteMany({ where: { bookingId: booking.id } });
    await prisma.payment.deleteMany({ where: { bookingId: booking.id } });
    await prisma.commission.create({
      data: {
        bookingId: booking.id,
        rate: 20,
        baseAmount: 250_000,
        commissionAmount: 50_000,
        netOwnerAmount: 200_000,
      },
    });

    const res = await GET(request("test-cron-secret"));
    const body = await res.json();

    expect(body.balanced).toBe(false);

    const alerts = await prisma.notification.findMany({
      where: { type: "RECONCILIATION_MISMATCH" },
    });
    expect(alerts.length).toBeGreaterThan(0);
    // It has to say where to look, or the alert is just anxiety.
    expect(alerts[0].actionUrl).toBe("/admin/finance/reports");
  });

  it("writes the discrepancy to the permanent log", async () => {
    const owner = await makeOwner();
    const client = await makeClient();
    const car = await makeCar(owner.profile.id);
    const booking = await paidBooking(car.id, client.id, { status: "COMPLETED" });

    await prisma.commission.deleteMany({ where: { bookingId: booking.id } });
    await prisma.payment.deleteMany({ where: { bookingId: booking.id } });
    await prisma.commission.create({
      data: {
        bookingId: booking.id,
        rate: 20,
        baseAmount: 250_000,
        commissionAmount: 50_000,
        netOwnerAmount: 200_000,
      },
    });

    await GET(request("test-cron-secret"));

    const log = await prisma.reconciliationLog.findFirst({ where: { hasMismatch: true } });
    expect(log).not.toBeNull();
    expect(log!.discrepancyAmount).not.toBe(0);
  });
});
