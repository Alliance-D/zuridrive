// =============================================================================
// ZuriDrive — Shared types
//
// Enums are NOT redeclared here. Prisma generates them from schema.prisma and
// that is the single source of truth:
//
//   import { UserRole, BookingStatus, CarStatus, RentalType } from "@prisma/client"
//
// A hand-written copy drifts from the database the moment the schema changes —
// which is exactly what happened with the old UserRole enum in this file (it
// conflated admin role modules like FLEET_MANAGER with actual user roles).
// =============================================================================

export type {
  AdminRoleModule,
  BookingStatus,
  CarCategory,
  CarStatus,
  DepositStatus,
  DisputeType,
  FuelPolicyType,
  FuelType,
  NotificationType,
  PaymentMethod,
  PaymentStatus,
  PayoutStatus,
  RentalType,
  SubscriptionStatus,
  TransmissionType,
  TripScope,
  UserRole,
} from "@prisma/client";

export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
};
