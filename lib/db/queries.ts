// Database Query Helpers

import { prisma } from "@/lib/prisma";
import type { BookingStatus } from "@prisma/client";

// Car Queries
export async function getCarWithDetails(carId: string) {
  return prisma.car.findUnique({
    where: { id: carId },
    include: {
      photos: { orderBy: { order: "asc" } },
      pricing: true,
      fuelPolicy: true,
      reviews: {
        // isVisible=false means a Content Moderator removed it
        where: { isVisible: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });
}

export async function getCarsByOwner(ownerId: string) {
  return prisma.car.findMany({
    where: { ownerId },
    include: {
      // order 0 is the cover photo
      photos: { orderBy: { order: "asc" }, take: 1 },
      pricing: true,
    },
    orderBy: { updatedAt: "desc" },
  });
}

// User Queries
export async function getUserByPhone(phone: string) {
  return prisma.user.findUnique({
    where: { phone },
    include: {
      carOwnerProfile: true,
    },
  });
}

export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
  });
}

// Booking Queries
export async function getBookingWithDetails(bookingId: string) {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      car: true,
      client: true,
      dispute: true,
    },
  });
}

export async function getOwnerBookings(ownerId: string, status?: BookingStatus) {
  return prisma.booking.findMany({
    where: {
      car: { ownerId },
      ...(status ? { status } : {}),
    },
    include: {
      car: true,
      client: true,
    },
    orderBy: { startDate: "desc" },
  });
}

// Payment Queries
export async function getPaymentsByBooking(bookingId: string) {
  return prisma.payment.findMany({
    where: { bookingId },
    orderBy: { createdAt: "desc" },
  });
}

// All export statements for easy importing
export const carQueries = {
  getCarWithDetails,
  getCarsByOwner,
};

export const userQueries = {
  getUserByPhone,
  getUserByEmail,
};

export const bookingQueries = {
  getBookingWithDetails,
  getOwnerBookings,
};

export const paymentQueries = {
  getPaymentsByBooking,
};
