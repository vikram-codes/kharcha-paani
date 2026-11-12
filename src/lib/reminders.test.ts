import { describe, expect, it } from "vitest";
import { billReminders, budgetReminder, catchupReminder, listNames, paydayReminder } from "./reminders";

const today = "2026-11-30";
const tomorrow = "2026-12-01";

describe("billReminders", () => {
  it("reminds the day before and on the day, with no amounts", () => {
    const r = billReminders(today, tomorrow, [
      { id: "rent", name: "Rent", date: tomorrow },
      { id: "pad", name: "Affirm walk pad", date: today },
    ]);
    expect(r).toEqual([
      { kind: "bills", keys: ["bill:rent:2026-12-01:before"], title: "Rent is due tomorrow", body: "A reminder for tomorrow.", url: "/" },
      { kind: "bills", keys: ["bill:pad:2026-11-30:due"], title: "Affirm walk pad is due today", body: "Tap to add it once it's paid.", url: "/?add=pad" },
    ]);
    expect(JSON.stringify(r)).not.toMatch(/\$|\d+\.\d\d/);
  });

  it("groups several bills on the same day into one", () => {
    const [r] = billReminders(today, tomorrow, [
      { id: "a", name: "Rent", date: tomorrow },
      { id: "b", name: "Claude", date: tomorrow },
      { id: "c", name: "Uber One", date: tomorrow },
    ]);
    expect(r.title).toBe("3 bills due tomorrow");
    expect(r.body).toBe("Rent, Claude and Uber One.");
    expect(r.keys).toHaveLength(3);
  });

  it("says nothing about bills further out or already overdue", () => {
    expect(billReminders(today, tomorrow, [{ id: "x", name: "X", date: "2026-12-05" }, { id: "y", name: "Y", date: "2026-11-27" }])).toEqual([]);
  });
});

describe("budgetReminder", () => {
  it("fires at 80% and at 100%, once each", () => {
    expect(budgetReminder("2026-11", "November", 2400, 3140)).toBeNull();
    expect(budgetReminder("2026-11", "November", 2512, 3140)).toMatchObject({ keys: ["budget:2026-11:80"], title: "80% of your November budget used" });
    // Straight past 100%: one notification, and the 80% one counts as sent.
    expect(budgetReminder("2026-11", "November", 3200, 3140)).toMatchObject({ keys: ["budget:2026-11:100", "budget:2026-11:80"], title: "November budget used up" });
    expect(budgetReminder("2026-11", "November", 100, 0)).toBeNull();
  });
});

describe("payday and catch-up", () => {
  it("payday only on the day", () => {
    expect(paydayReminder("2026-11-20", "2026-11-20")?.title).toBe("Payday today");
    expect(paydayReminder("2026-11-19", "2026-11-20")).toBeNull();
  });

  it("catch-up opens imports, once per Sunday, and names statements that are ready", () => {
    expect(catchupReminder("2026-11-15")).toMatchObject({ keys: ["catchup:2026-11-15"], url: "/imports" });
    expect(catchupReminder("2026-11-22", ["Triangle Mastercard", "Costco CIBC Mastercard"]).body).toBe(
      "Ready to import: Triangle Mastercard and Costco CIBC Mastercard. Then add this week's spending.",
    );
  });

  it("lists names naturally", () => {
    expect(listNames(["Rent"])).toBe("Rent");
    expect(listNames(["Rent", "Affirm"])).toBe("Rent and Affirm");
  });
});
