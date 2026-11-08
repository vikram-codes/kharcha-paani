"use server";

import { getMonthIndex } from "@/lib/data";

/** Month totals for the Summary month picker, fetched when the picker opens. */
export async function loadMonthIndex() {
  return getMonthIndex();
}
