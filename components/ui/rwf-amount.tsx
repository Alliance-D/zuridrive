import { currencyCode } from '@/lib/currency';
// Formatted RWF Amount Display

interface RWFAmountProps {
  amount: number;
  showCurrency?: boolean;
}

export function RWFAmount({ amount, showCurrency = true }: RWFAmountProps) {
  const formatted = amount.toLocaleString("fr-RW");

  return (
    <span className="font-semibold text-gray-900">
      {formatted}
      {showCurrency && <span className="text-sm text-gray-600"> {currencyCode}</span>}
    </span>
  );
}
