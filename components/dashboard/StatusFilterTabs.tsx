"use client";

/**
 * StatusFilterTabs — Horizontally scrollable status filter tab bar.
 * Updates the URL ?status= param on click (no full page reload via router.push).
 * Active tab is highlighted with a green pill style.
 */

import { useRouter, useSearchParams } from "next/navigation";

interface Tab {
  label: string;
  value: string;
}

interface StatusFilterTabsProps {
  tabs:   Tab[];
  active: string;
  total:  number;
}

export default function StatusFilterTabs({ tabs, active, total }: StatusFilterTabsProps) {
  const router      = useRouter();
  const searchParams = useSearchParams();

  function handleClick(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("status", value);
    params.delete("page"); // reset to page 1 on filter change
    router.push(`/dashboard/bookings?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
      {tabs.map(({ label, value }) => {
        const isActive = active === value;
        return (
          <button
            key={value}
            onClick={() => handleClick(value)}
            className={`
              flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium
              transition-all duration-150 active:scale-95
              ${isActive
                ? "bg-brand text-white shadow-sm"
                : "bg-white text-ink-soft ring-1 ring-sand-dark hover:ring-brand hover:text-brand"
              }
            `}
          >
            {label}
            {isActive && total > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white/20 px-1 text-[10px] font-bold">
                {total}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
