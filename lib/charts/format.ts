/**
 * Value formatting for charts.
 *
 * WHY THIS IS A NAME AND NOT A FUNCTION
 *
 * The analytics pages are Server Components — they run database queries. The
 * chart components are Client Components, because they handle hover and focus.
 * A function cannot cross that boundary: React throws
 *
 *   "Functions cannot be passed directly to Client Components"
 *
 * and the whole page fails to render. Passing `formatValue={(v) => ...}` from
 * a server page is exactly that mistake, and it took down /owner/analytics
 * and /admin/analytics completely.
 *
 * So the server names a format, and the client applies it. The name is a
 * plain string, which serialises fine.
 */

import { formatRWF, formatRWFCompact } from "@/lib/currency";

export type ChartFormat = "rwf" | "rwfCompact" | "number" | "rating" | "percent";

export function formatChartValue(value: number, format: ChartFormat): string {
  switch (format) {
    case "rwf":
      return formatRWF(value);
    case "rwfCompact":
      return formatRWFCompact(value);
    case "rating":
      return `${value.toFixed(1)} / 5`;
    case "percent":
      return `${Math.round(value)}%`;
    case "number":
    default:
      // Thousands separators — an unpunctuated 1284000 is unreadable at a glance.
      return value.toLocaleString("en-RW");
  }
}
