"use server";

import { FIRST_MONTH, HISTORY, getMonthIndex, historySummaryData, monthSummaryData } from "@/lib/data";
import { isMonthKey } from "@/lib/dates";

/** Month totals for the Summary month picker, fetched when the picker opens. */
export async function loadMonthIndex() {
  return getMonthIndex();
}

export type SummaryPayload =
  | { kind: "month"; key: string; data: Awaited<ReturnType<typeof monthSummaryData>> }
  | { kind: "history"; key: string; data: Awaited<ReturnType<typeof historySummaryData>> };

/** One Summary page's data, for switching months without leaving the page. */
export async function loadSummary(key: string): Promise<SummaryPayload> {
  if (key === HISTORY.key) return { kind: "history", key, data: await historySummaryData() };
  if (!isMonthKey(key) || key < FIRST_MONTH) throw new Error("Unknown month");
  return { kind: "month", key, data: await monthSummaryData(key) };
}
