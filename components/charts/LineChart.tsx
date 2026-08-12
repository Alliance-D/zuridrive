"use client";

import { formatChartValue, type ChartFormat } from "@/lib/charts/format";
import { colors } from "@/lib/design/tokens";

/**
 * LineChart — change over time, single series.
 *
 * Follows the data-viz mark specs: 2px line with round joins, ≥8px end marker
 * carrying a 2px surface ring, recessive grid, one axis. A single series needs
 * no legend — the card title names it.
 *
 * The crosshair snaps to the nearest X and the tooltip reads value-first.
 * Everything the tooltip shows is also in the table view below the chart, so
 * the hover layer enhances rather than gates.
 */

import { useState, useRef } from "react";

export interface Point {
  date: string;
  label: string;
  value: number;
}

const SERIES = "#2a78d6"; // validated categorical slot 1
const SURFACE = "#ffffff";

export default function LineChart({
  data,
  format = "number",
  height = 220,
  area = true,
}: {
  data: Point[];
  /** Named format applied client-side. See lib/charts/format.ts for why
   * this is a name rather than a function. */
  format?: ChartFormat;
  height?: number;
  area?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (data.length === 0) {
    return (
      <p className="rounded-xl bg-bone px-4 py-10 text-center text-sm text-ink-soft">
        No data in this period.
      </p>
    );
  }

  const PAD = { top: 12, right: 12, bottom: 24, left: 52 };
  const W = 720;
  const H = height;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const max = Math.max(...data.map((d) => d.value), 1);

  // Pick a tick step that divides evenly into four, so the gridline labels are
  // round numbers rather than the quarters of an arbitrary max (which is how
  // you end up with "RWF 23K" and "RWF 8K" on the axis).
  const rawStep = max / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalised = rawStep / magnitude;
  const niceMultiplier =
    normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10;
  const tickStep = niceMultiplier * magnitude;
  const niceMax = tickStep * 4;

  const x = (i: number) =>
    PAD.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / niceMax) * plotH;

  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(d.value)}`)
    .join(" ");

  const areaPath =
    `${linePath} L ${x(data.length - 1)} ${PAD.top + plotH}` +
    ` L ${x(0)} ${PAD.top + plotH} Z`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  // Show at most ~7 x labels so they never collide.
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    // Nearest point, not dead-centre.
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < data.length; i++) {
      const d = Math.abs(x(i) - px);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    setHover(nearest);
  }

  const active = hover !== null ? data[hover] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        style={{ height }}
        onPointerMove={handleMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Line chart, ${data.length} points, peak ${formatChartValue(max, format)}`}
      >
        {/* Recessive grid */}
        {gridLines.map((g) => (
          <line
            key={g}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + plotH * g}
            y2={PAD.top + plotH * g}
            stroke={colors.sand.dark}
            strokeWidth={1}
          />
        ))}

        {/* Y axis labels */}
        {gridLines.map((g) => (
          <text
            key={`y${g}`}
            x={PAD.left - 8}
            y={PAD.top + plotH * g + 4}
            textAnchor="end"
            fontSize={10}
            fill={colors.ink.faint}
          >
            {formatChartValue(Math.round(niceMax * (1 - g)), format)}
          </text>
        ))}

        {area && <path d={areaPath} fill={SERIES} fillOpacity={0.08} />}

        {/* 2px line, round joins */}
        <path
          d={linePath}
          fill="none"
          stroke={SERIES}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* End marker — ≥8px with a 2px surface ring */}
        <circle
          cx={x(data.length - 1)}
          cy={y(data[data.length - 1].value)}
          r={4}
          fill={SERIES}
          stroke={SURFACE}
          strokeWidth={2}
        />

        {/* Crosshair */}
        {hover !== null && (
          <>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke={colors.ink.faint}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle
              cx={x(hover)}
              cy={y(data[hover].value)}
              r={5}
              fill={SERIES}
              stroke={SURFACE}
              strokeWidth={2}
            />
          </>
        )}

        {/* X axis labels */}
        {data.map((d, i) =>
          i % labelEvery === 0 || i === data.length - 1 ? (
            <text
              key={d.date}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              fontSize={10}
              fill={colors.ink.faint}
            >
              {d.label}
            </text>
          ) : null,
        )}
      </svg>

      {/* Tooltip — value leads, label follows */}
      {active && (
        <div
          className="pointer-events-none absolute top-2 rounded-lg bg-ink px-2.5 py-1.5 text-white shadow-lg"
          style={{
            left: `${(x(hover!) / W) * 100}%`,
            transform: "translateX(-50%)",
          }}
        >
          <p className="text-sm font-bold leading-tight">
            {formatChartValue(active.value, format)}
          </p>
          <p className="text-[10px] text-white/70">{active.label}</p>
        </div>
      )}
    </div>
  );
}
