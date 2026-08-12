import type { Config } from "tailwindcss";
import { colors } from "./lib/design/tokens";

// Colour lives in lib/design/tokens.ts — the single source of truth, shared
// with the CSS custom properties in app/globals.css. The palette that used to
// sit here was a template leftover (a sky-blue "primary" scale) that nothing
// referenced, while components hard-coded ~1,700 hex literals instead.

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  corePlugins: {
    // app/globals.css defines its own .container with fluid clamp() padding.
    // Leaving Tailwind's enabled means two rules with the same name and the
    // winner decided by source order — which is not something to leave to luck.
    container: false,
  },
  theme: {
    extend: {
      colors,
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        // display and mono were reachable only through a hand-written
        // .font-display rule in globals.css and raw var(--font-mono) in inline
        // styles. As real Tailwind families they gain the variants everything
        // else has (lg:font-display, hover:, and so on) and stop being a
        // separate system to remember.
        display: ["var(--font-display)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
        lg: ["1.125rem", { lineHeight: "1.75rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.5rem", { lineHeight: "2rem" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
        "4xl": ["2.25rem", { lineHeight: "2.5rem" }],

        // FLUID scale, mirroring --text-* in globals.css.
        //
        // Kept separate from the fixed sizes above rather than replacing them:
        // the dashboards were written against Tailwind's fixed rem values, and
        // swapping those for clamp() would resize 23 existing usages. The
        // marketing pages want the fluid scale, and were reaching it through
        // inline `fontSize: "var(--text-xl)"` — which is precisely the kind of
        // escape hatch this consolidation exists to remove.
        "fluid-xs": "var(--text-xs)",
        "fluid-sm": "var(--text-sm)",
        "fluid-base": "var(--text-base)",
        "fluid-lg": "var(--text-lg)",
        "fluid-xl": "var(--text-xl)",
        "fluid-2xl": "var(--text-2xl)",
        "fluid-3xl": "var(--text-3xl)",
        "fluid-4xl": "var(--text-4xl)",
        "fluid-hero": "var(--text-hero)",
      },
      spacing: {
        "safe-top": "env(safe-area-inset-top)",
        "safe-bottom": "env(safe-area-inset-bottom)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-in",
        "slide-up": "slideUp 0.3s ease-out",
        "spin-slow": "spin 3s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": {
            transform: "translateY(10px)",
            opacity: "0",
          },
          "100%": {
            transform: "translateY(0)",
            opacity: "1",
          },
        },
      },
    },
  },
  plugins: [require("@tailwindcss/forms"), require("@tailwindcss/typography")],
};

export default config;
