import { describe, expect, it } from "vitest";
import {
  isUnderEvidenced,
  matchRank,
  scoreConfidence,
  MIN_ASSESSED_WEIGHT,
} from "@/lib/matching/evidence";

describe("scoreConfidence", () => {
  // The real case: "Postal Delivery Driver - 60% match", scored on length of
  // experience alone with 80% of the weight unassessed.
  it("treats a score built on one minor dimension as not scorable", () => {
    expect(scoreConfidence({ effectiveWeightTotal: 20 })).toEqual({
      underEvidenced: true,
      assessedWeight: 20,
    });
  });

  it("accepts a score once at least half the weight was assessed", () => {
    expect(isUnderEvidenced({ effectiveWeightTotal: MIN_ASSESSED_WEIGHT })).toBe(false);
    expect(isUnderEvidenced({ effectiveWeightTotal: 100 })).toBe(false);
  });

  it("rejects everything just below the line", () => {
    expect(isUnderEvidenced({ effectiveWeightTotal: MIN_ASSESSED_WEIGHT - 1 })).toBe(true);
    expect(isUnderEvidenced({ effectiveWeightTotal: 0 })).toBe(true);
  });

  it("says nothing is wrong when there is no breakdown at all", () => {
    expect(isUnderEvidenced(null)).toBe(false);
    expect(isUnderEvidenced(undefined)).toBe(false);
  });
});

describe("matchRank", () => {
  it("ranks a real score above any under-evidenced one, however high", () => {
    const real = { effectiveWeightTotal: 65, score: 38 };
    const hollow = { effectiveWeightTotal: 20, score: 60 };
    expect(matchRank(real)).toBeGreaterThan(matchRank(hollow));
  });

  it("orders real scores against each other normally", () => {
    expect(matchRank({ effectiveWeightTotal: 70, score: 88 })).toBeGreaterThan(
      matchRank({ effectiveWeightTotal: 55, score: 61 }),
    );
  });

  it("puts a job with no score last of all", () => {
    expect(matchRank(null)).toBeLessThan(matchRank({ effectiveWeightTotal: 20, score: 60 }));
  });

  it("sorts a mixed list the way the jobs page does", () => {
    const rows = [
      { name: "receptionist", breakdown: { effectiveWeightTotal: 20, score: 60 } },
      { name: "test analyst", breakdown: { effectiveWeightTotal: 70, score: 88 } },
      { name: "unscored", breakdown: null },
      { name: "qa engineer", breakdown: { effectiveWeightTotal: 50, score: 42 } },
    ];
    const order = rows
      .sort((a, b) => matchRank(b.breakdown) - matchRank(a.breakdown))
      .map((r) => r.name);
    expect(order).toEqual(["test analyst", "qa engineer", "receptionist", "unscored"]);
  });
});
