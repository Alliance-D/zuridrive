/**
 * Finance sub-navigation.
 *
 * Counts come from the caller so each page can show live queue sizes without
 * every page re-running the same aggregate.
 */

import { SubNav } from "@/components/admin/ui";

export const FINANCE_SECTIONS = [
  { label: "Payments", href: "/admin/finance/payments" },
  { label: "Payouts", href: "/admin/finance/payouts" },
  { label: "Deposits", href: "/admin/finance/deposits" },
  { label: "Commission", href: "/admin/finance/commissions" },
  { label: "Subscriptions", href: "/admin/finance/subscriptions" },
  { label: "Extra charges", href: "/admin/finance/extra-charges" },
  { label: "Reconciliation", href: "/admin/finance/reports" },
] as const;

export function FinanceNav({
  active,
  counts,
}: {
  active: string;
  counts?: Partial<Record<string, number>>;
}) {
  return (
    <SubNav
      active={active}
      items={FINANCE_SECTIONS.map((s) => ({
        label: s.label,
        href: s.href,
        count: counts?.[s.href],
      }))}
    />
  );
}
