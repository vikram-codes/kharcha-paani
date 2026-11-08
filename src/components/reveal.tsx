import { Suspense, type ReactNode } from "react";

/**
 * Suspense boundary for a screen's data. The skeleton shows until data arrives,
 * then the content fades up with a plain CSS animation (no View Transitions:
 * those snapshot the page and can flash a blank frame).
 */
export function Reveal({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  return (
    <Suspense fallback={fallback}>
      <div className="kp-reveal">{children}</div>
    </Suspense>
  );
}
