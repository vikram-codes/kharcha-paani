import type { MonthKey } from "./dates";

/** First month with full data in the app; earlier history is one combined Money Pro period. */
export const FIRST_MONTH: MonthKey = "2026-01";
export const HISTORY = { key: "2025", start: "2024-12-01", end: "2025-12-31", label: "2024–2025" } as const;
