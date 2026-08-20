/**
 * Saving an unfinished car listing.
 *
 * The wizard is five steps including three to ten photo uploads, and it held
 * everything in browser memory until the final submit. A dead battery, a
 * dropped connection or a mistapped back button lost the lot. On a
 * mobile-first platform that is the kind of thing that makes an owner not
 * come back.
 *
 * A draft is deliberately not a listing: invisible to everyone but its owner,
 * not validated, and — the part that is easy to get wrong — not counted
 * against the plan's listing cap.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma, resetDatabase, disconnect } from "../helpers/db";
import { makeOwner, makeClient, makeCar, makePlans, makeSettings } from "../helpers/factories";

const session = vi.hoisted(() => ({ current: null as { user: { id: string } } | null }));
vi.mock("next-auth", () => ({ getServerSession: async () => session.current }));

const { PUT, GET, DELETE } = await import("@/app/api/owner/cars/draft/route");
const { getOwnerAllowance } = await import("@/lib/subscriptions/limits");

function request(body?: unknown) {
  return new Request("http://test/api/owner/cars/draft", {
    method: body ? "PUT" : "GET",
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

describe("listing drafts", () => {
  it("refuses an anonymous caller", async () => {
    const res = await PUT(request({ form: { make: "Toyota" }, step: 1 }));
    expect(res.status).toBe(401);
  });

  it("refuses someone who is not a car owner", async () => {
    const client = await makeClient();
    session.current = { user: { id: client.id } };

    const res = await PUT(request({ form: { make: "Toyota" }, step: 1 }));
    expect(res.status).toBe(403);
  });

  it("saves a half-finished form and hands it back", async () => {
    const owner = await makeOwner();
    session.current = { user: { id: owner.user.id } };

    await PUT(request({ form: { make: "Toyota", model: "Land Cruiser" }, step: 2 }));

    const res = await GET();
    const body = await res.json();

    expect(body.draft.step).toBe(2);
    expect(body.draft.form).toMatchObject({ make: "Toyota", model: "Land Cruiser" });
  });

  it("keeps one draft per owner rather than piling them up", async () => {
    const owner = await makeOwner();
    session.current = { user: { id: owner.user.id } };

    await PUT(request({ form: { make: "Toyota" }, step: 1 }));
    await PUT(request({ form: { make: "Nissan" }, step: 3 }));

    const rows = await prisma.carListingDraft.findMany({
      where: { ownerId: owner.profile.id },
    });
    expect(rows).toHaveLength(1);
    // The later save wins — it is the same listing, further along.
    expect(rows[0].step).toBe(3);
  });

  it("keeps one owner's draft away from another's", async () => {
    const a = await makeOwner();
    const b = await makeOwner();

    session.current = { user: { id: a.user.id } };
    await PUT(request({ form: { make: "Toyota" }, step: 2 }));

    session.current = { user: { id: b.user.id } };
    const res = await GET();
    expect((await res.json()).draft).toBeNull();
  });

  it("reports no draft rather than failing when there is none", async () => {
    const owner = await makeOwner();
    session.current = { user: { id: owner.user.id } };

    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).draft).toBeNull();
  });

  it("discards a draft that is already gone without complaining", async () => {
    const owner = await makeOwner();
    session.current = { user: { id: owner.user.id } };

    // Discarding nothing is a success, not a 404.
    const res = await DELETE();
    expect(res.status).toBe(200);
  });

  it("does not spend a listing slot on unfinished work", async () => {
    // The one that matters. An owner on the single-car plan who starts a
    // second listing and abandons it half-way must not be locked out of
    // listing again, with nothing on screen to explain why.
    await makePlans();
    const owner = await makeOwner();
    session.current = { user: { id: owner.user.id } };

    const before = await getOwnerAllowance(owner.profile.id);

    await PUT(request({ form: { make: "Toyota" }, step: 2 }));

    const after = await getOwnerAllowance(owner.profile.id);
    expect(after.used).toBe(before.used);
    expect(after.canListMore).toBe(before.canListMore);
  });

  it("still counts real listings against the cap", async () => {
    // The guard above must not have quietly stopped the cap working.
    await makePlans();
    const owner = await makeOwner();

    const before = await getOwnerAllowance(owner.profile.id);
    await makeCar(owner.profile.id);
    const after = await getOwnerAllowance(owner.profile.id);

    expect(after.used).toBe(before.used + 1);
  });
});
