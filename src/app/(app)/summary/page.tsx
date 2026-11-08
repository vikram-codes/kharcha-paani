import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { monthKey, todayISO } from "@/lib/dates";

/** /summary → this month's summary (Summary tab). */
export default function SummaryIndex() {
  return (
    <Suspense fallback={null}>
      <ToCurrentMonth />
    </Suspense>
  );
}

async function ToCurrentMonth() {
  await connection();
  redirect(`/summary/${monthKey(todayISO())}`);
  return null;
}
