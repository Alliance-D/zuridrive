/**
 * Condition photo retention.
 *
 * These photos are the ONLY evidence in a damage dispute, and that matters more
 * in Phase 1 than it did before: ZuriDrive no longer holds a deposit, so there
 * is no money in our custody to arbitrate over. When two people disagree about
 * a scratch, the photos are all anyone has.
 *
 * The failure mode being guarded against is silent and permanent. The cron job
 * destroys the Cloudinary asset — there is no undo, no backup, and nothing in
 * the UI that would show a photo went missing until somebody needs it. So the
 * tests below are mostly about what must NOT be deleted.
 *
 * The deletion criteria, mirrored from app/api/cron/delete-photos/route.ts:
 *   retainUntil <= now  AND  isLocked = false  AND  isDeleted = false
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma, resetDatabase, disconnect } from "../helpers/db";
import { makeOwner, makeCar, makeClient, makeSettings } from "../helpers/factories";
import {
  setRetentionOnCompletion,
  lockPhotosForDispute,
  setRetentionOnDisputeResolution,
  adminLockPhotos,
  adminUnlockPhotos,
  extendRetention,
  getPhotoUploadStatus,
} from "@/lib/photos/retention";

vi.mock("@/lib/sms", () => ({
  sendSms: vi.fn(async () => ({ success: true })),
  SMS_TEMPLATES: new Proxy({}, { get: () => () => "sms" }),
}));

const DAY = 24 * 60 * 60 * 1000;

async function scenario() {
  const owner = await makeOwner();
  const car = await makeCar(owner.profile.id);
  const client = await makeClient();

  const booking = await prisma.booking.create({
    data: {
      reference: `ZD-${Math.floor(Math.random() * 1e9)}`,
      clientId: client.id,
      carId: car.id,
      startDate: new Date(Date.now() - 5 * DAY),
      endDate: new Date(Date.now() - 2 * DAY),
      tripEndedAt: new Date(Date.now() - 2 * DAY),
      totalDays: 3,
      status: "COMPLETED",
      rentalType: "PER_DAY",
      baseRatePerDay: 45_000,
      baseAmount: 135_000,
      driverTotal: 0,
      deliveryFee: 0,
      subtotal: 135_000,
      commissionRate: 0,
      commissionAmount: 0,
      ownerEarnings: 135_000,
      depositAmount: 0,
    },
  });

  return { owner, car, client, booking };
}

async function addPhoto(
  bookingId: string,
  uploadedById: string,
  opts: { isPreTrip?: boolean; isFuelGauge?: boolean; retainUntil?: Date | null } = {},
) {
  return prisma.bookingConditionPhoto.create({
    data: {
      bookingId,
      uploadedById,
      isPreTrip: opts.isPreTrip ?? true,
      isFuelGauge: opts.isFuelGauge ?? false,
      url: "https://res.cloudinary.com/demo/image/upload/x.jpg",
      publicId: `zuridrive/condition_photos/${Math.random().toString(36).slice(2)}`,
      retainUntil: opts.retainUntil ?? null,
    },
  });
}

/** Exactly what the cron job would pick up, right now. */
async function whatTheCronWouldDelete() {
  return prisma.bookingConditionPhoto.findMany({
    where: {
      retainUntil: { lte: new Date() },
      isLocked: false,
      isDeleted: false,
    },
    select: { id: true },
  });
}

beforeEach(async () => {
  await resetDatabase();
  await makeSettings();
});

afterAll(disconnect);

// ---------------------------------------------------------------------------

describe("a completed trip starts the clock", () => {
  it("sets a retention date in the future, not the past", async () => {
    const { booking, client } = await scenario();
    const photo = await addPhoto(booking.id, client.id);

    await setRetentionOnCompletion(booking.id);

    const after = await prisma.bookingConditionPhoto.findUnique({
      where: { id: photo.id },
    });

    expect(after!.retainUntil).not.toBeNull();
    expect(after!.retainUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("does not make photos immediately deletable", async () => {
    const { booking, client } = await scenario();
    await addPhoto(booking.id, client.id);

    await setRetentionOnCompletion(booking.id);

    expect(await whatTheCronWouldDelete()).toHaveLength(0);
  });

  it("never pulls an existing retention date EARLIER", async () => {
    // The module documents itself as append-safe: calls arriving out of order
    // must not shorten a window somebody deliberately extended.
    const { booking, client } = await scenario();
    const faraway = new Date(Date.now() + 90 * DAY);
    const photo = await addPhoto(booking.id, client.id, { retainUntil: faraway });

    await setRetentionOnCompletion(booking.id);

    const after = await prisma.bookingConditionPhoto.findUnique({
      where: { id: photo.id },
    });
    expect(after!.retainUntil!.getTime()).toBe(faraway.getTime());
  });

  it("leaves locked photos alone", async () => {
    const { booking, client } = await scenario();
    const photo = await addPhoto(booking.id, client.id);
    await prisma.bookingConditionPhoto.update({
      where: { id: photo.id },
      data: { isLocked: true, retainUntil: null },
    });

    await setRetentionOnCompletion(booking.id);

    const after = await prisma.bookingConditionPhoto.findUnique({
      where: { id: photo.id },
    });
    // A lock means indefinite. Completion must not quietly schedule deletion.
    expect(after!.retainUntil).toBeNull();
    expect(after!.isLocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("an open dispute freezes everything", () => {
  it("makes retention indefinite", async () => {
    const { booking, client, owner } = await scenario();
    await addPhoto(booking.id, client.id);
    await addPhoto(booking.id, owner.user.id, { isPreTrip: false });

    await setRetentionOnCompletion(booking.id);
    await lockPhotosForDispute(booking.id);

    const photos = await prisma.bookingConditionPhoto.findMany({
      where: { bookingId: booking.id },
    });

    expect(photos).toHaveLength(2);
    for (const p of photos) {
      expect(p.isLocked).toBe(true);
      expect(p.retainUntil).toBeNull();
    }
  });

  it("takes photos OUT of the deletion queue even if they were already due", async () => {
    // The dangerous ordering: a trip completes, three days pass, and only then
    // does somebody open a dispute. The evidence must come back off the queue.
    const { booking, client } = await scenario();
    await addPhoto(booking.id, client.id, {
      retainUntil: new Date(Date.now() - 1 * DAY), // already overdue
    });

    expect(await whatTheCronWouldDelete()).toHaveLength(1);

    await lockPhotosForDispute(booking.id);

    expect(await whatTheCronWouldDelete()).toHaveLength(0);
  });

  it("does not resurrect photos already deleted", async () => {
    const { booking, client } = await scenario();
    const photo = await addPhoto(booking.id, client.id);
    await prisma.bookingConditionPhoto.update({
      where: { id: photo.id },
      data: { isDeleted: true, deletedAt: new Date(), url: "", publicId: "" },
    });

    await lockPhotosForDispute(booking.id);

    const after = await prisma.bookingConditionPhoto.findUnique({
      where: { id: photo.id },
    });
    // The Cloudinary asset is gone. Locking a tombstone would only mislead.
    expect(after!.isDeleted).toBe(true);
    expect(after!.isLocked).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("resolving a dispute restarts the clock", () => {
  it("unlocks and gives a fresh window", async () => {
    const { booking, client } = await scenario();
    await addPhoto(booking.id, client.id);

    await lockPhotosForDispute(booking.id);
    await setRetentionOnDisputeResolution(booking.id);

    const photo = await prisma.bookingConditionPhoto.findFirst({
      where: { bookingId: booking.id },
    });

    expect(photo!.isLocked).toBe(false);
    expect(photo!.retainUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("does not delete the evidence the moment the dispute closes", async () => {
    // Either party may still want to appeal. Resolution starts a countdown,
    // it does not empty the bin.
    const { booking, client } = await scenario();
    await addPhoto(booking.id, client.id);

    await lockPhotosForDispute(booking.id);
    await setRetentionOnDisputeResolution(booking.id);

    expect(await whatTheCronWouldDelete()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe("admin holds", () => {
  it("locking removes photos from the deletion queue", async () => {
    const { booking, client } = await scenario();
    await addPhoto(booking.id, client.id, {
      retainUntil: new Date(Date.now() - 1 * DAY),
    });

    const count = await adminLockPhotos(booking.id);

    expect(count).toBe(1);
    expect(await whatTheCronWouldDelete()).toHaveLength(0);
  });

  it("unlocking gives a fresh window rather than deleting immediately", async () => {
    const { booking, client } = await scenario();
    await addPhoto(booking.id, client.id, {
      retainUntil: new Date(Date.now() - 30 * DAY),
    });

    await adminLockPhotos(booking.id);
    const count = await adminUnlockPhotos(booking.id);

    expect(count).toBe(1);
    // The old, long-expired date must not be restored — that would destroy the
    // photos on the very next cron run, seconds after an admin released a hold.
    expect(await whatTheCronWouldDelete()).toHaveLength(0);
  });

  it("counts only photos on the booking asked about", async () => {
    const a = await scenario();
    const b = await scenario();
    await addPhoto(a.booking.id, a.client.id);
    await addPhoto(b.booking.id, b.client.id);

    expect(await adminLockPhotos(a.booking.id)).toBe(1);

    const other = await prisma.bookingConditionPhoto.findFirst({
      where: { bookingId: b.booking.id },
    });
    expect(other!.isLocked).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("extending retention", () => {
  it("pushes the date forward", async () => {
    const { booking, client } = await scenario();
    await addPhoto(booking.id, client.id, {
      retainUntil: new Date(Date.now() + 1 * DAY),
    });

    const count = await extendRetention(booking.id, 30);

    expect(count).toBe(1);
    const photo = await prisma.bookingConditionPhoto.findFirst({
      where: { bookingId: booking.id },
    });
    expect(photo!.retainUntil!.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
  });

  it("refuses to SHORTEN an existing window", async () => {
    const { booking, client } = await scenario();
    const faraway = new Date(Date.now() + 365 * DAY);
    await addPhoto(booking.id, client.id, { retainUntil: faraway });

    await extendRetention(booking.id, 7);

    const photo = await prisma.bookingConditionPhoto.findFirst({
      where: { bookingId: booking.id },
    });
    expect(photo!.retainUntil!.getTime()).toBe(faraway.getTime());
  });

  it("does not touch locked photos", async () => {
    const { booking, client } = await scenario();
    await addPhoto(booking.id, client.id);
    await adminLockPhotos(booking.id);

    await extendRetention(booking.id, 30);

    const photo = await prisma.bookingConditionPhoto.findFirst({
      where: { bookingId: booking.id },
    });
    // Locked already means indefinite; writing a finite date would weaken it.
    expect(photo!.retainUntil).toBeNull();
    expect(photo!.isLocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("upload status tells both parties where they stand", () => {
  it("attributes photos to the right side", async () => {
    const { booking, client, owner } = await scenario();
    await addPhoto(booking.id, client.id, { isPreTrip: true });
    await addPhoto(booking.id, client.id, { isPreTrip: true });
    await addPhoto(booking.id, owner.user.id, { isPreTrip: true });
    await addPhoto(booking.id, owner.user.id, { isPreTrip: false });

    const status = await getPhotoUploadStatus(booking.id);

    expect(status.preTripClient).toBe(2);
    expect(status.preTripOwner).toBe(1);
    expect(status.postTripOwner).toBe(1);
    expect(status.postTripClient).toBe(0);
  });

  it("only reports both-uploaded when BOTH actually have", async () => {
    const { booking, client, owner } = await scenario();
    await addPhoto(booking.id, client.id, { isPreTrip: true });

    let status = await getPhotoUploadStatus(booking.id);
    expect(status.bothUploadedPreTrip).toBe(false);

    await addPhoto(booking.id, owner.user.id, { isPreTrip: true });

    status = await getPhotoUploadStatus(booking.id);
    expect(status.bothUploadedPreTrip).toBe(true);
  });

  it("tracks the fuel gauge separately for each end of the trip", async () => {
    const { booking, client } = await scenario();
    await addPhoto(booking.id, client.id, { isPreTrip: true, isFuelGauge: true });

    const status = await getPhotoUploadStatus(booking.id);
    expect(status.hasFuelGaugePre).toBe(true);
    expect(status.hasFuelGaugePost).toBe(false);
  });

  it("ignores deleted photos", async () => {
    const { booking, client } = await scenario();
    const photo = await addPhoto(booking.id, client.id, { isPreTrip: true });
    await prisma.bookingConditionPhoto.update({
      where: { id: photo.id },
      data: { isDeleted: true },
    });

    const status = await getPhotoUploadStatus(booking.id);
    expect(status.preTripClient).toBe(0);
  });

  it("returns zeros for a booking that does not exist", async () => {
    const status = await getPhotoUploadStatus("no-such-booking");
    expect(status.preTripClient).toBe(0);
    expect(status.bothUploadedPreTrip).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("where the two lock reasons collide", () => {
  it("a dispute resolution CLEARS an admin legal hold", async () => {
    // This pins current behaviour rather than endorsing it.
    //
    // isLocked is a single boolean serving two different purposes: "locked
    // because a dispute is open" and "locked because an admin placed a hold".
    // Nothing in the schema distinguishes them, so resolving a dispute
    // releases an admin hold too, and the photos become deletable in three
    // days.
    //
    // It is not reachable today — adminLockPhotos has no caller and no UI. It
    // becomes a live evidence-destruction bug the moment somebody wires up a
    // "legal hold" button, so it is recorded here to be found.
    const { booking, client } = await scenario();
    await addPhoto(booking.id, client.id);

    await adminLockPhotos(booking.id); // legal hold
    await setRetentionOnDisputeResolution(booking.id); // unrelated dispute closes

    const photo = await prisma.bookingConditionPhoto.findFirst({
      where: { bookingId: booking.id },
    });

    expect(photo!.isLocked).toBe(false);
    expect(photo!.retainUntil).not.toBeNull();
  });
});
