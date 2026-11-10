"use client";

import { ErrorScreen } from "@/components/error-screen";

/** A crashed page inside the app: the nav stays, the page shows what broke. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} />;
}
