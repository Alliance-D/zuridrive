/**
 * Shared presentational pieces for the admin console.
 *
 * Server-component safe — nothing here uses hooks or handlers.
 */

import { Link } from "@/i18n/navigation";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "dark" | "warn" | "danger";
}) {
  const tones = {
    default: "bg-white text-ink",
    dark: "bg-brand text-white",
    warn: "bg-warning-bg text-warning",
    danger: "bg-danger-bg text-danger",
  } as const;

  const hintTones = {
    default: "text-ink-faint",
    dark: "text-brand-tint",
    warn: "text-warning-strong",
    danger: "text-danger-strong",
  } as const;

  return (
    <div className={`rounded-2xl p-4 shadow-sm ${tones[tone]}`}>
      <p
        className={`text-xs ${tone === "dark" ? "text-brand-tint" : tone === "default" ? "text-ink-soft" : ""}`}
      >
        {label}
      </p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {hint && <p className={`mt-1 text-[11px] ${hintTones[tone]}`}>{hint}</p>}
    </div>
  );
}

export function Card({
  title,
  action,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && (
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warn" | "danger" | "info";
}) {
  const tones = {
    neutral: "bg-sand text-ink-muted",
    success: "bg-success-bg text-success",
    warn: "bg-warning-tint text-warning-dark",
    danger: "bg-danger-bg text-danger",
    info: "bg-info-bg text-info",
  } as const;

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-bone px-4 py-8 text-center text-sm text-ink-soft">
      {children}
    </div>
  );
}

/** Horizontally scrollable table wrapper — admin tables are wide. */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="-mx-4 overflow-x-auto px-4">{children}</div>;
}

export function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`whitespace-nowrap pb-2 text-${align} text-xs font-medium text-ink-faint`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  muted = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  muted?: boolean;
}) {
  return (
    <td
      className={`whitespace-nowrap py-2.5 text-${align} text-xs ${
        muted ? "text-ink-soft" : "text-ink"
      }`}
    >
      {children}
    </td>
  );
}

export function SubNav({
  items,
  active,
}: {
  items: { label: string; href: string; count?: number }[];
  active: string;
}) {
  return (
    <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
            active === item.href
              ? "bg-brand text-white"
              : "bg-white text-ink-soft hover:text-ink"
          }`}
        >
          {item.label}
          {item.count !== undefined && item.count > 0 && (
            <span
              className={`rounded-full px-1.5 text-[10px] ${
                active === item.href
                  ? "bg-white/20"
                  : "bg-warning-tint text-warning-dark"
              }`}
            >
              {item.count}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
