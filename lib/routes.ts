// =============================================================================
// ZuriDrive — Typed route constants
//
// Two naming styles are exported deliberately:
//   • camelCase  — what the pages and components use (ROUTES.cars, ROUTES.book)
//   • UPPER_CASE — the original constants, kept so nothing breaks
// Both point at the same paths. Prefer camelCase in new code.
// =============================================================================

export const routes = {
  // Public
  home: "/",
  cars: "/cars",
  carDetail: (id: string) => `/cars/${id}`,
  howItWorks: "/how-it-works",
  // Renamed from /become-an-owner so the URL matches the label used
  // everywhere in the UI. next.config.mjs keeps a permanent redirect from the
  // old path — it was linked from the nav, the footer and how-it-works.
  becomeAnOwner: "/list-your-car",

  // Booking flow
  book: (carId: string) => `/book/${carId}`,
  bookPayment: (carId: string) => `/book/${carId}/payment`,
  bookConfirmation: (carId: string) => `/book/${carId}/confirmation`,

  // Auth
  login: "/login",
  signup: "/signup",
  signupOwner: "/signup/owner",

  // Client dashboard
  dashboard: "/dashboard",
  bookings: "/dashboard/bookings",
  bookingDetail: (id: string) => `/dashboard/bookings/${id}`,
  bookingPhotos: (id: string) => `/dashboard/bookings/${id}/photos`,
  bookingReview: (id: string) => `/dashboard/bookings/${id}/review`,
  profile: "/dashboard/profile",
  notifications: "/dashboard/notifications",

  // Owner dashboard
  ownerDashboard: "/owner/dashboard",
  ownerFleet: "/owner/fleet",
  ownerFleetNew: "/owner/fleet/new",
  ownerFleetEdit: (id: string) => `/owner/fleet/${id}/edit`,
  ownerBookings: "/owner/bookings",
  ownerBookingDetail: (id: string) => `/owner/bookings/${id}`,
  ownerEarnings: "/owner/earnings",
  ownerPayouts: "/owner/payouts",
  ownerSubscription: "/owner/subscription",
  ownerLocations: "/owner/locations",
  ownerProfile: "/owner/profile",
  ownerReviews: "/owner/reviews",

  // Admin
  admin: "/admin",
  adminUsers: "/admin/users",
  adminFleet: "/admin/fleet",
  adminBookings: "/admin/bookings",
  adminFinance: "/admin/finance",
  adminDisputes: "/admin/disputes",
  adminAnalytics: "/admin/analytics",
  adminSettings: "/admin/settings",

  // API endpoints called from client components
  api: {
    otpRequest: "/api/auth/otp",
    otpVerify: "/api/auth/verify-otp",
    bookings: "/api/bookings",
    upload: "/api/upload",
    profile: "/api/profile",
    reviews: "/api/reviews",
  },

  // ── Original UPPER_CASE constants ────────────────────────────────────────
  LOGIN: "/login",
  SIGNUP: "/signup",
  SIGNUP_OWNER: "/signup/owner",

  CARS: "/cars",
  CAR_DETAIL: (id: string) => `/cars/${id}`,
  HOW_IT_WORKS: "/how-it-works",
  BECOME_OWNER: "/become-an-owner",

  DASHBOARD: "/dashboard",
  BOOKINGS: "/dashboard/bookings",
  BOOKING_DETAIL: (id: string) => `/dashboard/bookings/${id}`,
  PROFILE: "/dashboard/profile",

  OWNER_DASHBOARD: "/owner/dashboard",
  OWNER_FLEET: "/owner/fleet",
  OWNER_FLEET_NEW: "/owner/fleet/new",
  OWNER_FLEET_EDIT: (id: string) => `/owner/fleet/${id}/edit`,
  OWNER_BOOKINGS: "/owner/bookings",
  OWNER_BOOKING_DETAIL: (id: string) => `/owner/bookings/${id}`,
  OWNER_EARNINGS: "/owner/earnings",
  OWNER_PAYOUTS: "/owner/payouts",
  OWNER_SUBSCRIPTION: "/owner/subscription",
  OWNER_LOCATIONS: "/owner/locations",
  OWNER_PROFILE: "/owner/profile",
  OWNER_REVIEWS: "/owner/reviews",

  ADMIN: "/admin",
  ADMIN_USERS: "/admin/users",
  ADMIN_USER_DETAIL: (id: string) => `/admin/users/${id}`,
  ADMIN_FLEET: "/admin/fleet",
  ADMIN_FLEET_DETAIL: (id: string) => `/admin/fleet/${id}`,
  ADMIN_BOOKINGS: "/admin/bookings",
  ADMIN_BOOKING_DETAIL: (id: string) => `/admin/bookings/${id}`,
  ADMIN_FINANCE: "/admin/finance",
  ADMIN_PAYMENTS: "/admin/finance/payments",
  ADMIN_PAYOUTS: "/admin/finance/payouts",
  ADMIN_DEPOSITS: "/admin/finance/deposits",
  ADMIN_DISPUTES: "/admin/disputes",
  ADMIN_DISPUTE_DETAIL: (id: string) => `/admin/disputes/${id}`,
  ADMIN_ANALYTICS: "/admin/analytics",
  ADMIN_SETTINGS: "/admin/settings",
} as const;

export type RouteType = typeof routes;

// Several modules import this as ROUTES.
export const ROUTES = routes;
