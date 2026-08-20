/**
 * The day-before trip reminder.
 *
 * This is the one notification from the specification that was worth paying
 * for. Every SMS is billed, so the tests that matter here are the ones about
 * not sending: not twice for the same trip, not for a booking that is not
 * going ahead, not for a trip that is not tomorrow.
 *
 * A no-show costs the owner a day's rental and the platform its commission,
 * which is worth many times the two messages that prevent it. That argument
 * only holds while it stays two messages.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma, resetDatabase, disconnect } from "../helpers/db";
import { makeOwner, makeCar, makeClient, paidBooking, makeSettings } from "../helpers/factories";

process.env.CRON_SECRET = "test-cron-secret";

// Count what would be billed, without billing it.
const sent = vi.hoisted(() => ({ calls: [] as { to: string; messageKey?: string }[] }));
vi.mock("@/lib/sms", () => ({
  sendSms: async (args: { to: string; messageKey?: string }) => {
    sent.calls.push(args);
    return { success: true };
  },
}));

const { GET } = await import("@/app/api/cron/trip-reminders/route");

function request(secret = "test-cron-secret") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Request("http://test/api/cron/trip-reminders", {
    headers: { authorization: `Bearer ${secret}` },
  }) as any;
}

const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return d;
};

async function tripStarting(when: Date, status: "CONFIRMED" | "PENDING_PAYMENT" = "CONFIRMED") {
  const owner = await makeOwner();
  const client = await makeClient();
  const car = await makeCar(owner.profile.id);
  return paidBooking(car.id, client.id, {
    status,
    startDate: when,
    endDate: new Date(when.getTime() + 3 * 86_400_000),
  });
}

beforeEach(async () => {
  await resetDatabase();
  await makeSettings();
  sent.calls = [];
});

afterAll(disconnect);

describe("trip reminders", () => {
  it("refuses a caller without the cron secret", async () => {
    const res = await GET(request("wrong"));
    expect(res.status).toBe(401);
  });

  it("reminds both parties about a trip starting tomorrow", async () => {
    await tripStarting(inDays(1));

    const res = await GET(request());
    const body = await res.json();

    expect(body.tripsStartingTomorrow).toBe(1);
    // Both, because they have to meet — a reminder that reaches only the
    // renter still leaves the owner not there.
    expect(sent.calls).toHaveLength(2);
  });

  it("never bills twice for the same trip", async () => {
    // The cost control. A retry, a redeploy, or a cron that fires twice must
    // not send a second round of messages.
    await tripStarting(inDays(1));

    await GET(request());
    const afterFirst = sent.calls.length;
    await GET(request());

    expect(sent.calls.length).toBe(afterFirst);
  });

  it("stays quiet about trips that are not tomorrow", async () => {
    await tripStarting(inDays(5));
    await tripStarting(inDays(0));

    await GET(request());
    expect(sent.calls).toHaveLength(0);
  });

  it("does not promise a trip that is not going ahead", async () => {
    // Still waiting on payment: nothing to remind anybody about yet.
    await tripStarting(inDays(1), "PENDING_PAYMENT");

    await GET(request());
    expect(sent.calls).toHaveLength(0);
  });

  it("files the reminder in the notification centre too", async () => {
    const booking = await tripStarting(inDays(1));

    await GET(request());

    const rows = await prisma.notification.findMany({
      where: { type: "TRIP_STARTING_TOMORROW" },
    });
    // In-app costs nothing, so both parties get it either way.
    expect(rows).toHaveLength(2);
    expect(rows[0].actionUrl).toContain(booking.id);
  });

  it("folds the photo prompt into the same message", async () => {
    // Two jobs, one message. "Your trip starts tomorrow" and "remember the
    // photos" are the same conversation on the same day.
    await tripStarting(inDays(1));
    await GET(request());

    const keys = sent.calls.map((c) => c.messageKey);
    expect(keys).toContain("tripStartingTomorrowClient");
    expect(keys).toContain("tripStartingTomorrowOwner");
  });
});
