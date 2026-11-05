import { describe, expect, it } from "vitest";
import { jobDateFilter } from "@/lib/jobsources/date-filter";

describe("job date filter", () => {
  const now = Date.parse("2026-11-05T16:00:00Z");

  it.each([undefined, "", "0", "-1", "1.5", "invalid"])(
    "uses a rolling 24-hour window for %s",
    (days) => {
      const cutoff = new Date("2026-11-04T16:00:00Z");
      expect(jobDateFilter(days, now)).toEqual({
        OR: [
          { postedAt: { gte: cutoff } },
          { postedAt: null, retrievedAt: { gte: cutoff } },
        ],
      });
    },
  );

  it("supports wider searches and all dates", () => {
    expect(jobDateFilter("3", now).OR?.[0]).toEqual({
      postedAt: { gte: new Date("2026-11-02T16:00:00Z") },
    });
    expect(jobDateFilter("all", now)).toEqual({});
  });
});
