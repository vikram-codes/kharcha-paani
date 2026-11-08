import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvObjects } from "./csv";

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
