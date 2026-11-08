import { Suspense, ViewTransition, type ReactNode } from "react";

/**
 * Suspense boundary whose skeleton slides out and real content slides in
 * (React <ViewTransition>, browser View Transitions API). No-op where unsupported.
 */
export function Reveal({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <ViewTransition exit="vt-skeleton-out" default="none">
          <div>{fallback}</div>
        </ViewTransition>
      }
    >
      <ViewTransition enter="vt-content-in" default="none">
        <div>{children}</div>
      </ViewTransition>
    </Suspense>
  );
}
