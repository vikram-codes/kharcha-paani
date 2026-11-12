import { describe, expect, it } from "vitest";
import { nextStatementEnd, statementStatus } from "./statements-due";

describe("nextStatementEnd", () => {
  it("keeps the same day each month", () => {
    expect(nextStatementEnd("2026-10-18")).toBe("2026-11-18");
    expect(nextStatementEnd("2026-11-05")).toBe("2026-12-05");
  });

  it("keeps Chequing on the last day of the month", () => {
    expect(nextStatementEnd("2026-10-31")).toBe("2026-11-30");
    expect(nextStatementEnd("2026-11-30")).toBe("2026-12-31");
    expect(nextStatementEnd("2027-01-31")).toBe("2027-02-28");
  });
});

describe("statementStatus", () => {
  it("is up to date until the next statement has been out a couple of days", () => {
    expect(statementStatus("2026-10-18", "2026-11-19")).toMatchObject({ nextEnd: "2026-11-18", behind: 0, readySince: null });
    expect(statementStatus("2026-10-18", "2026-11-20")).toMatchObject({ behind: 1, readySince: "2026-11-20" });
  });

  it("counts statements missed in a row", () => {
    expect(statementStatus("2026-09-05", "2026-11-11")).toMatchObject({ nextEnd: "2026-10-05", behind: 2, readySince: "2026-10-07" });
  });

  it("knows nothing for an account never imported", () => {
    expect(statementStatus(null, "2026-11-11")).toEqual({ lastEnd: null, nextEnd: null, behind: 0, readySince: null });
  });
});
