"use client";

import { useEffect, useState } from "react";

type RotatingContextChipsProps = {
  items: readonly string[];
  intervalMs?: number;
};

export function RotatingContextChips({ items, intervalMs = 2200 }: RotatingContextChipsProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % items.length);
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [items.length, intervalMs]);

  return (
    <div className="context-chips">
      {items.map((context, index) => (
        <span key={context} className={index === activeIndex ? "active" : undefined}>
          {context}
        </span>
      ))}
    </div>
  );
}
