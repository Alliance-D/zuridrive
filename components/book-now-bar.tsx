"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { formatMoney } from "@/lib/currency";
import { routes } from "@/lib/routes";

interface BookNowBarProps {
  carId: string;
  /** Cheapest daily rate, in RWF. Omitted when the car has no pricing yet. */
  startingPrice?: number;
}

export function BookNowBar({ carId, startingPrice }: BookNowBarProps) {
  const t = useTranslations("cars");
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 200);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 md:hidden bg-white border-t border-gray-200 shadow-lg p-4">
      <div className="flex gap-2">
        <div className="flex-1">
          <div className="text-sm text-gray-600">{t("pricePerDayLabel")}</div>
          <div className="text-2xl font-bold text-blue-600">
            {startingPrice != null ? formatMoney(startingPrice) : "—"}
          </div>
        </div>
        <a
          href={routes.book(carId)}
          className="flex flex-1 items-center justify-center bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition py-3"
        >
          {t("bookNow")}
        </a>
      </div>
    </div>
  );
}

// Default export so pages can `import BookNowBar from "@/components/..."`.
export default BookNowBar;
