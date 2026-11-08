"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { animate, useReducedMotion } from "motion/react";
import { formatCents } from "@/lib/money";

const noop = () => () => {};

/**
 * Money that counts to its value. Server-rendered (hydrated) numbers appear as
 * they are, so a page never flashes $0; numbers rendered in the browser (data
 * that just arrived, a month switch) count up, or roll from the old value.
 */
export function AnimatedCents({
  value,
  whole,
  signed,
  className,
  duration = 0.5,
}: {
  value: number;
  whole?: boolean;
  signed?: boolean;
  className?: string;
  duration?: number;
}) {
  // true only while hydrating server HTML
  const hydrating = useSyncExternalStore(noop, () => false, () => true);
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  const fmt = (c: number) => formatCents(Math.round(c), { whole, signed });
  // The text React renders never changes after mount; the effect drives it, so
  // re-renders can't snap the number back mid-animation.
  const [initialText] = useState(() => fmt(hydrating ? value : 0));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current ?? (hydrating ? value : 0);
    shown.current = value;
    if (reduce || from === value) {
      el.textContent = fmt(value);
      return;
    }
    const controls = animate(from, value, {
      duration,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => {
        el.textContent = fmt(v);
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animate only when the value changes
  }, [value]);

  return (
    <span ref={ref} className={className} suppressHydrationWarning>
      {initialText}
    </span>
  );
}
