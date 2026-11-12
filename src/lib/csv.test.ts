import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvObjects, toCsv } from "./csv";

describe("parseCsv", () => {
  it("splits simple rows", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("handles quoted commas, escaped quotes and newlines", () => {
    expect(parseCsv('x,"Student loan (India, via Remitly)","say ""hi""","two\nlines"')).toEqual([
      ["x", "Student loan (India, via Remitly)", 'say "hi"', "two\nlines"],
    ]);
  });

  it("handles CRLF, a BOM and empty fields", () => {
    expect(parseCsv("﻿a,,c\r\n1,,3\r\n")).toEqual([["a", "", "c"], ["1", "", "3"]]);
  });

  it("keeps a last row without a trailing newline", () => {
    expect(parseCsv("a\n1")).toEqual([["a"], ["1"]]);
  });
});

describe("parseCsvObjects", () => {
  it("keys rows by header and fills missing cells", () => {
    expect(parseCsvObjects("date,amount,note\n2026-01-01,-35.0\n")).toEqual([
      { date: "2026-01-01", amount: "-35.0", note: "" },
    ]);
  });
});

describe("toCsv", () => {
  it("round-trips commas, quotes, newlines and empty cells", () => {
    const rows = [["date", "description", "amount"], ["2026-11-10", 'Remitly, "India"\nEMI', -550], ["2026-11-11", null, 0]];
    expect(parseCsv(toCsv(rows))).toEqual([["date", "description", "amount"], ["2026-11-10", 'Remitly, "India"\nEMI', "-550"], ["2026-11-11", "", "0"]]);
  });

  it("keeps formulas from running, but not negative amounts", () => {
    expect(toCsv([["=HYPERLINK(1)", "-12.50", -3]])).toBe("'=HYPERLINK(1),-12.50,-3\r\n");
  });
});
