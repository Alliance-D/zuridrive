/**
 * Finance sub-navigation.
 *
 * Counts come from the caller so each page can show live queue sizes without
 * every page re-running the same aggregate.
 *
 * The section list carries message keys rather than labels: it is evaluated at
 * import, where no translator exists, so a label written here would be English
 * on every page in every language.
 */

import { getTranslations } from "next-intl/server";
import { SubNav } from "@/components/admin/ui";

export const FINANCE_SECTIONS = [
  { labelKey: "navPayments", href: "/admin/finance/payments" },
  { labelKey: "navPayouts", href: "/admin/finance/payouts" },
  { labelKey: "navDeposits", href: "/admin/finance/deposits" },
  { labelKey: "navCommission", href: "/admin/finance/commissions" },
  { labelKey: "navSubscriptions", href: "/admin/finance/subscriptions" },
  { labelKey: "navExtraCharges", href: "/admin/finance/extra-charges" },
  { labelKey: "navReconciliation", href: "/admin/finance/reports" },
] as const;

export async function FinanceNav({
  active,
  counts,
  locale,
}: {
  active: string;
  counts?: Partial<Record<string, number>>;
  locale: string;
}) {
  const t = await getTranslations({ locale, namespace: "finance" });

  return (
    <SubNav
      active={active}
      items={FINANCE_SECTIONS.map((s) => ({
        label: t(s.labelKey),
        href: s.href,
        count: counts?.[s.href],
      }))}
    />
  );
}
