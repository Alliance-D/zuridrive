// =============================================================================
// ZuriDrive — Condition photo categories
//
// Lives in lib/ rather than in the route file: App Router route handlers may
// only export HTTP methods, and any extra export fails the build's route type
// validation.
// =============================================================================

/**
 * Fuel policies that REQUIRE a fuel gauge photo.
 * Typed as string[] so callers can test a possibly-null policy type directly.
 */
export const FUEL_GAUGE_REQUIRED_POLICIES: string[] = [
  'FULL_TO_FULL',
  'SAME_LEVEL',
];

/** Photo categories used for the upload prompts. */
export const PHOTO_CATEGORIES = [
  { id: 'EXTERIOR_FRONT', label: 'Exterior — Front', required: true, icon: '🚗' },
  { id: 'EXTERIOR_REAR',  label: 'Exterior — Rear',  required: true, icon: '🔙' },
  { id: 'EXTERIOR_LEFT',  label: 'Exterior — Left Side',  required: true, icon: '◀' },
  { id: 'EXTERIOR_RIGHT', label: 'Exterior — Right Side', required: true, icon: '▶' },
  { id: 'INTERIOR',       label: 'Interior',          required: true, icon: '🪑' },
  { id: 'FUEL_GAUGE',     label: 'Fuel Gauge',        required: false, icon: '⛽' }, // required based on policy
  { id: 'OTHER',          label: 'Additional Photo',  required: false, icon: '📷' },
] as const;

export type PhotoCategoryId = (typeof PHOTO_CATEGORIES)[number]['id'];
