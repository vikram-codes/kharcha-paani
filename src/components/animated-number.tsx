"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";
import { formatCents } from "@/lib/money";

/**
 * Money that counts up to its value when it first appears (page load or data
 * arriving) and rolls from the old value when it changes (e.g. switching
 * months). Server HTML starts at $0 too, so the first frame and hydration agree
 * and the count starts the moment the content fades in.
 */
export function AnimatedCents({
  value,
  whole,
  signed,
  className,
  duration = 1.5,
}: {
  value: number;
  whole?: boolean;
  signed?: boolean;
  className?: string;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  // The number currently on screen (mid-animation included).
  const displayed = useRef(0);
  const fmt = (c: number) => formatCents(Math.round(c), { whole, signed });
  // React only ever renders this initial text; the effect drives the number
  // afterwards, so re-renders can't snap it back mid-animation.
  const [initialText] = useState(() => fmt(0));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Start from what's on screen, not the last target: a re-run (React dev
    // double-invokes effects; a month switch mid-count) then continues smoothly.
    const from = displayed.current;
    if (reduce || from === value) {
      displayed.current = value;
      el.textContent = fmt(value);
      return;
    }
    const controls = animate(from, value, {
      duration,
      ease: [0.16, 1, 0.3, 1], // fast start, soft landing
      onUpdate: (v) => {
        displayed.current = v;
        el.textContent = fmt(v);
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animate only when the value changes
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {initialText}
    </span>
  );
}
