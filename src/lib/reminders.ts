/**
 * Phone reminders (#3, owner, Nov 11 2026). Notifications only remind: no
 * amounts or balances, since they show on the lock screen where the app's
 * PIN doesn't apply. Each reminder carries the log keys it covers, so it's
 * never sent twice (the morning job runs at two UTC hours for daylight time).
 */
export type ReminderKind = "bills" | "payday" | "budget" | "catchup" | "test";
export type Reminder = {
  kind: ReminderKind;
  /** notification_log keys; empty = always send (a test). */
  keys: string[];
  title: string;
  body: string;
  /** Where tapping it opens. */
  url: string;
};

/** "Rent", "Rent and Affirm", "Rent, Affirm and Apple". */
export function listNames(names: string[]) {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The bill reminders for one morning: due tomorrow, and due today (still not added). */
export function billReminders(today: string, tomorrow: string, bills: { id: string; name: string; date: string }[]): Reminder[] {
  const out: Reminder[] = [];
  for (const [when, date, stage] of [
    ["tomorrow", tomorrow, "before"],
    ["today", today, "due"],
  ] as const) {
    const list = bills.filter((b) => b.date === date);
    if (!list.length) continue;
    const one = list.length === 1;
    out.push({
      kind: "bills",
      keys: list.map((b) => `bill:${b.id}:${date}:${stage}`),
      title: one ? `${list[0].name} is due ${when}` : `${list.length} bills due ${when}`,
      body: one
        ? when === "today"
          ? "Tap to add it once it's paid."
          : "A reminder for tomorrow."
        : `${listNames(list.map((b) => b.name))}.${when === "today" ? " Tap to add them once paid." : ""}`,
      url: one && when === "today" ? `/?add=${list[0].id}` : "/",
    });
  }
  return out;
}

/** 80% / 100% of the month's budget, once each per month. */
export function budgetReminder(month: string, monthName: string, spent: number, budget: number): Reminder | null {
  if (budget <= 0) return null;
  if (spent * 100 >= budget * 100)
    return { kind: "budget", keys: [`budget:${month}:100`, `budget:${month}:80`], title: `${monthName} budget used up`, body: "Tap to see where it went.", url: "/budgets" };
  if (spent * 100 >= budget * 80)
    return { kind: "budget", keys: [`budget:${month}:80`], title: `80% of your ${monthName} budget used`, body: "Tap to see where it's gone.", url: "/budgets" };
  return null;
}

export function paydayReminder(today: string, payday: string | null): Reminder | null {
  if (payday !== today) return null;
  return { kind: "payday", keys: [`payday:${today}`], title: "Payday today", body: "Your paycheque should land today.", url: "/" };
}

/** Sunday catch-up; names the statements that are out but not imported yet. */
export function catchupReminder(today: string, statementsReady: string[] = []): Reminder {
  return {
    kind: "catchup",
    keys: [`catchup:${today}`],
    title: "Time to catch up",
    body: statementsReady.length
      ? `Ready to import: ${listNames(statementsReady)}. Then add this week's spending.`
      : "Add this week's spending and check in with Claude.",
    url: "/imports",
  };
}
