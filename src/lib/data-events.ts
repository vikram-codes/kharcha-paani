/**
 * "Something was saved" signal for screens that keep their own copy of data
 * (Transactions, Summary). Server refreshes don't reach that local state, so
 * every save calls notifyDataChanged() and those screens reload what they show.
 */
export const DATA_CHANGED = "kp:data-changed";

export function notifyDataChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DATA_CHANGED));
}

export function onDataChanged(fn: () => void) {
  window.addEventListener(DATA_CHANGED, fn);
  return () => window.removeEventListener(DATA_CHANGED, fn);
}
