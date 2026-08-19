// =============================================================================
// ZuriDrive — Colour tokens
//
// THE single source of truth for brand colour. Imported by tailwind.config.ts,
// and mirrored into the CSS custom properties in app/globals.css.
//
// This exists because the codebase had ~1,700 hard-coded hex literals like
// bg-[#1B4332] scattered across 121 files, plus a parallel set of CSS variables
// that had already drifted from them — the marketing pages used #FAF8F4 for the
// page background while every app screen used #F7F5F0. Nobody chose that; it
// happened because there was no one place to look.
//
// Rules:
//   • Never write a hex literal in a component. Use a token.
//   • Adding a colour means adding it here first.
//   • The values in globals.css :root must match this file.
// =============================================================================

export const colors = {
  /** Deep forest green. The brand. */
  brand: {
    DEFAULT: "#1B4332",
    dark: "#163828", // hover/pressed
    // The hero's backdrop, behind the car photograph. Matches
    // --color-primary-dark in globals.css, which had no token — it was only
    // reachable from an inline style.
    darkest: "#0F2B1F",
    deep: "#155228",
    deepest: "#14532D",
    light: "#2D6A4F",
    /** Legible on a brand-coloured background. */
    tint: "#A7D1BF",
    /** Barely-there green wash for selected/hover rows. */
    wash: "#F0F5F2",
  },

  /**
   * Gold. Used sparingly — highlights, never large fills.
   *
   * DEFAULT is a fill colour: on a light background it manages 2.2:1, which is
   * fine behind dark text and not fine as text. `ink` is the readable version
   * for anywhere the gold carries words rather than decorates them.
   */
  accent: {
    DEFAULT: "#D4A017",
    /** The gold as text on a light background — 4.25:1. */
    ink: "#96700D",
    light: "#E8BC3A",
    dark: "#96700D",
    strong: "#F0C040",
    mid: "#E6B020",
    deep: "#B8880E",
    soft: "#F5D98B",
    pale: "#FCD34D",
    wash: "#FDF2D8",
  },

  /** Page background. Warm off-white, not pure white. */
  bone: "#F7F5F0",

  /** Raised and sunken surfaces, and borders. */
  sand: {
    DEFAULT: "#F0EDE8",
    // The lightest border, used where sand-dark reads too heavy. Matches
    // --color-border-light in globals.css, which had no token at all — the
    // marketing pages could only reach it through an inline style.
    light: "#EDE7DC",
    dark: "#E5E0D8", // default border
    darker: "#D4CFC8",
    // The default input/control border. Matches --color-border in globals.css,
    // which had no token — the third such gap found during this migration,
    // all of them colours only ever reachable from an inline style.
    edge: "#DDD5C8",
    warm: "#E8E4DD",
    mute: "#C4BFB8",
  },

  /** Text. Four weights, darkest first. */
  ink: {
    DEFAULT: "#1C1C1C",
    /** --color-black: the gallery backdrop, darker than ink. */
    black: "#0A0A0A",
    muted: "#374151",
    /* soft and faint both failed WCAG AA as text: 4.14:1 on the surface and
       2.33:1 on the page background, against a 4.5:1 requirement. Darkened
       with headroom rather than to exactly 4.5, so a later change to a
       background does not quietly push them back under. These mirror
       --color-text-muted and --color-text-subtle in globals.css; the two files
       must agree, because Tailwind utilities read from here and hand-written
       CSS reads from there. */
    soft: "#5B6472",  // 5.49:1 on bg, 5.12:1 on surface
    faint: "#656B78", // 5.35:1 on white, 4.58:1 on surface
    line: "#D1D5DB", // hairline dividers
  },

  /** Informational, distinct from the reserved status colours. */
  info: {
    DEFAULT: "#1E40AF",
    bg: "#DBEAFE",
  },

  // Status colours are reserved. They never double as a chart series or a
  // decorative fill — if green means "good" in one place it cannot mean
  // "category 3" in another.
  success: {
    DEFAULT: "#166534",
    bg: "#DCFCE7",
  },

  danger: {
    /** --color-error: the warmer red used for form validation. */
    error: "#C0392B",
    DEFAULT: "#991B1B",
    strong: "#B91C1C",
    soft: "#FCA5A5",
    bg: "#FEE2E2",
    tint: "#FEF2F2",
  },

  warning: {
    DEFAULT: "#7C5E10",
    strong: "#B7791F",
    dark: "#92400E",
    bg: "#FEF7E6",
    tint: "#FEF3C7",
    pale: "#FFFBEB",
  },
} as const;

/**
 * Maps every hex literal that was previously written inline to its token.
 * Kept so the migration is auditable, and so a stray literal reintroduced in a
 * future patch can be traced back to what it should have been.
 */
export const LEGACY_HEX_TO_TOKEN: Record<string, string> = {
  "#1B4332": "brand",
  "#163828": "brand-dark",
  "#0F2B1F": "brand-darkest",
  "#2D6A4F": "brand-light",
  "#A7D1BF": "brand-tint",
  "#D4A017": "accent",
  "#96700D": "accent-ink",
  "#F7F5F0": "bone",
  "#F0EDE8": "sand",
  "#EDE7DC": "sand-light",
  "#E5E0D8": "sand-dark",
  "#D4CFC8": "sand-darker",
  "#DDD5C8": "sand-edge",
  "#0A0A0A": "ink-black",
  "#1C1C1C": "ink",
  "#374151": "ink-muted",
  "#5B6472": "ink-soft",
  "#656B78": "ink-faint",
  "#166534": "success",
  "#DCFCE7": "success-bg",
  "#991B1B": "danger",
  "#C0392B": "danger-error",
  "#B91C1C": "danger-strong",
  "#FCA5A5": "danger-soft",
  "#FEE2E2": "danger-bg",
  "#FEF2F2": "danger-tint",
  "#7C5E10": "warning",
  "#B7791F": "warning-strong",
  "#92400E": "warning-dark",
  "#FEF7E6": "warning-bg",
  "#FEF3C7": "warning-tint",
};
