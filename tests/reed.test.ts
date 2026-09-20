import { describe, expect, it } from "vitest";
import { parseReedDate } from "@/lib/jobsources/parse";

describe("parseReedDate", () => {
  it("reads Reed's DD/MM/YYYY format", () => {
    const date = parseReedDate("04/09/2026");
    expect(date?.toISOString().slice(0, 10)).toBe("2026-09-04");
  });

  // 04/09 is 4 September in the UK and 9 April in the US. Reed is a UK board.
  it("does not read the day as a month", () => {
    const date = parseReedDate("04/09/2026");
    expect(date?.getUTCMonth()).toBe(8);
    expect(date?.getUTCDate()).toBe(4);
  });

  it("returns null for unparseable input", () => {
    expect(parseReedDate("not a date")).toBeNull();
  });
});
