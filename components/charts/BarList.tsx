"use client";

import { formatChartValue, type ChartFormat } from "@/lib/charts/format";

/**
 * BarList — ranked magnitude with identity (top cars, funnel stages).
 *
 * Horizontal bars, because the labels are names and horizontal keeps them
 * readable without rotation. Per the mark specs: bars capped in thickness with
 * a 4px rounded data-end and a square baseline edge, growing from one baseline.
 *
 * Values are direct-labelled rather than hidden in a tooltip — with ranked data
 * the number is the point, and direct labels also satisfy the relief rule.
 */

import { useState } from "react";

export interface BarItem {
  id: string;
  label: string;
  value: number;
  /** Optional secondary text under the label. */
  meta?: string;
}

const SERIES = "#2a78d6";

export default function BarList({
  items,
  format = "number",
  emptyMessage,
}: {
  items: BarItem[];
  /** Named format applied client-side. See lib/charts/format.ts for why
   * this is a name rather than a function. */
  format?: ChartFormat;
  emptyMessage?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <p className="rounded-xl bg-bone px-4 py-8 text-center text-sm text-ink-soft">
        {emptyMessage}
      </p>
    );
  }

  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <ul className="space-y-2.5">
      {items.map((item, index) => {
        const pct = (item.value / max) * 100;
        const isHover = hover === item.id;

        return (
          <li
            key={item.id}
            onPointerEnter={() => setHover(item.id)}
            onPointerLeave={() => setHover(null)}
            className="group"
          >
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-xs text-ink-muted">
                <span className="mr-1.5 text-[10px] font-semibold text-ink-faint">
                  {index + 1}
                </span>
                {item.label}
              </span>
              {/* Direct label — value leads */}
              <span className="shrink-0 text-xs font-bold text-ink">
                {formatChartValue(item.value, format)}
              </span>
            </div>

            {/* Single baseline; 4px rounded data-end, square at the baseline */}
            <div className="h-2.5 w-full overflow-hidden rounded-l-none bg-sand">
              <div
                className="h-full transition-all"
                style={{
                  width: `${Math.max(pct, 1.5)}%`,
                  background: SERIES,
                  opacity: isHover ? 1 : 0.85,
                  borderTopRightRadius: 4,
                  borderBottomRightRadius: 4,
                }}
              />
            </div>

            {item.meta && (
              <p className="mt-0.5 text-[10px] text-ink-faint">{item.meta}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
