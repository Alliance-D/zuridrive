/**
 * Only the renter may act on their own booking's payment.
 *
 * This route had no authentication whatsoever. It loaded the booking straight
 * from the id in the URL and proceeded, and a booking id is not a secret — it
 * sits in a URL and is known to both parties. The `initiate_momo` action takes
 * the destination phone number from the request body, so anyone holding an id
 * could push a payment prompt to any number they chose, as often as they
 * liked, at the platform's expense and to a stranger's phone.
 *
 * These assert the shape of the guard rather than driving HTTP, so they run
 * without a server: the handler is invoked directly with a mocked session.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { resetDatabase, disconnect } from "../helpers/db";
import { makeOwner, makeCar, makeClient, paidBooking, makeSettings } from "../helpers/factories";

// The route reads the session through next-auth; give it one we control.
const session = vi.hoisted(() => ({ current: null as { user: { id: string } } | null }));
vi.mock("next-auth", () => ({
  getServerSession: async () => session.current,
}));

const { POST, GET } = await import("@/app/api/bookings/[id]/payment/route");

function request(body?: unknown) {
  return new Request("http://test/api/bookings/x/payment", {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

beforeEach(async () => {
  await resetDatabase();
  await makeSettings();
  session.current = null;
});

afterAll(disconnect);

async function aBooking() {
  const owner = await makeOwner();
  const client = await makeClient();
  const car = await makeCar(owner.profile.id);
  const booking = await paidBooking(car.id, client.id, { status: "PENDING_PAYMENT" });
  return { booking, client, owner };
}

describe("payment endpoint authorization", () => {
  it("refuses an anonymous caller before it even reads the body", async () => {
    const { booking } = await aBooking();

    const res = await POST(request({ action: "initiate_momo", phoneNumber: "0788000000" }), {
      params: { id: booking.id },
    });

    expect(res?.status).toBe(401);
  });

  it("refuses an anonymous GET", async () => {
    const { booking } = await aBooking();
    const res = await GET(request(), { params: { id: booking.id } });
    expect(res.status).toBe(401);
  });

  it("will not let one signed-in user touch another's booking", async () => {
    const { booking } = await aBooking();
    const stranger = await makeClient();
    session.current = { user: { id: stranger.id } };

    const res = await POST(request({ action: "initiate_momo", phoneNumber: "0788000000" }), {
      params: { id: booking.id },
    });

    // 404, not 403: confirming the booking exists is itself a small leak.
    expect(res?.status).toBe(404);
  });

  it("will not leak payment state to a stranger", async () => {
    const { booking } = await aBooking();
    const stranger = await makeClient();
    session.current = { user: { id: stranger.id } };

    const res = await GET(request(), { params: { id: booking.id } });
    expect(res.status).toBe(404);
  });

  it("lets the booking's own client through", async () => {
    const { booking, client } = await aBooking();
    session.current = { user: { id: client.id } };

    const res = await GET(request(), { params: { id: booking.id } });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("bookingStatus");
  });
});
