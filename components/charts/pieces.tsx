/**
 * Shared analytics pieces — used by /admin/analytics and /owner/analytics.
 *
 * All server-safe (no hooks), so they render inside server components without
 * pulling either page into the client bundle.
 *
 * Two rules these encode, so no caller has to remember them:
 *   • A delta with no baseline renders as "no prior period", never as a
 *     fabricated +100% against zero.
 *   • Every chart gets a TableView beside it, so the numbers are reachable
 *     without hovering — the hover layer enhances, it never gates.
 */

import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export function Metric({
  label,
  value,
  hint,
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
      {delta !== undefined && <Delta value={delta} />}
      {hint && <p className="mt-1 text-[11px] text-ink-faint">{hint}</p>}
    </div>
  );
}

/**
 * Period-on-period change. Renders a dash when there's no baseline — a
 * fabricated "+100%" against zero would be misleading.
 */
export function Delta({
  value,
  onDark = false,
}: {
  value: number | null | undefined;
  onDark?: boolean;
}) {
  if (value === null || value === undefined) {
    return (
      <span
        className={`mt-1 flex items-center gap-1 text-[11px] ${onDark ? "text-brand-tint" : "text-ink-faint"}`}
      >
        <Minus className="h-3 w-3" />
        no prior period
      </span>
    );
  }

  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;

  return (
    <span
      className={`mt-1 flex items-center gap-1 text-[11px] font-semibold ${
        onDark ? "text-accent" : up ? "text-success" : "text-danger-strong"
      }`}
    >
      <Icon className="h-3 w-3" />
      {up ? "+" : ""}
      {value}% vs previous period
    </span>
  );
}

/**
 * Table view of the same numbers the chart plots.
 * Collapsed by default; keeps every value reachable without hovering.
 */
export function TableView({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: string[][];
}) {
  if (rows.length === 0) return null;

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[11px] text-ink-faint hover:text-brand">
        View as table
      </summary>
      <div className="mt-2 max-h-56 overflow-y-auto">
        <table className="w-full text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-sand text-left text-ink-faint">
              {headers.map((h) => (
                <th key={h} className="py-1 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-sand">
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td
                    key={j}
                    className={`py-1 ${j === 0 ? "text-ink-soft" : "font-medium text-ink"}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
