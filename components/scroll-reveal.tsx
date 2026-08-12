"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Fades content in as it scrolls into view.
 *
 * THIS COMPONENT USED TO HIDE CONTENT PERMANENTLY. Worth understanding, because
 * the failure was invisible in two different ways:
 *
 *   1. It rendered `opacity-0` and then, on intersection, added a `slide-up`
 *      class. That animation has no `animation-fill-mode: forwards`, so opacity
 *      returned to the base value — 0 — the moment it finished. Content faded
 *      in and then vanished again.
 *
 *   2. None of that was visible while Tailwind was misconfigured. `opacity-0`
 *      is a Tailwind utility, and app/globals.css was missing its @tailwind
 *      directives, so the class did nothing at all and everything just showed.
 *      Fixing Tailwind is what made this bug start hiding entire pages.
 *
 * The rule now: reveal state is React state, not a class the observer bolts on.
 * If anything goes wrong — no IntersectionObserver, an error, a browser that
 * never fires the callback — the content ends up VISIBLE. Never invisible.
 */

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger, in milliseconds, before the reveal runs. */
  delay?: number;
}

export function ScrollReveal({
  children,
  className = "",
  delay = 0,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;

    // No observer support, or no node: show it rather than hide it forever.
    if (!node || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    // Respect a user who has asked for less motion — show immediately.
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    if (reduced) {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (delay) {
            setTimeout(() => setShown(true), delay);
          } else {
            setShown(true);
          }
          observer.unobserve(entry.target);
        }
      },
      // Start slightly before the element enters, so it is already in place by
      // the time the reader's eye reaches it.
      { threshold: 0.05, rootMargin: "0px 0px -40px 0px" },
    );

    observer.observe(node);

    // Safety net. If the callback never fires — an offscreen container, a
    // browser quirk, a display:none ancestor that later becomes visible —
    // reveal anyway. Content being late is survivable; content never
    // appearing is not.
    const failsafe = setTimeout(() => setShown(true), 2000);

    return () => {
      observer.disconnect();
      clearTimeout(failsafe);
    };
  }, [delay]);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        shown ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export default ScrollReveal;
