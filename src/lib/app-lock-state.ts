"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the app lock is covering the screen, plus how many times it has
 * been lifted. Animations (the money count-up) wait for the cover to lift and
 * replay after each unlock, so they play in front of you, not behind the PIN.
 * Starts covered: AppLock (in the app layout) lifts it once it has decided.
 */
type LockView = { covered: boolean; reveals: number };

let view: LockView = { covered: true, reveals: 0 };
const listeners = new Set<() => void>();

export function setLockCovered(covered: boolean) {
  if (covered === view.covered) return;
  view = { covered, reveals: covered ? view.reveals : view.reveals + 1 };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const SERVER: LockView = { covered: true, reveals: 0 };

export const useLockView = () =>
  useSyncExternalStore(
    subscribe,
    () => view,
    () => SERVER,
  );
