import { describe, expect, it } from "vitest";
import { describeIngest } from "@/lib/jobsources/summary";
import type { IngestSummary } from "@/lib/jobsources/ingest";

const result = (source: string, over: Partial<IngestSummary> = {}): IngestSummary => ({
  source,
  received: 0,
  created: 0,
  updated: 0,
  duplicates: 0,
  skipped: 0,
  ...over,
});

const CAREERJET_403 =
  "Careerjet refused this request: Forbidden. If it names an IP address, add that address to the allowed list in your Careerjet publisher account.";

describe("describeIngest", () => {
  it("reports a successful search", () => {
    const outcome = describeIngest([
      result("adzuna", { received: 30, created: 4, updated: 6, skipped: 20 }),
      result("careerjet", { received: 30, created: 2, updated: 1, duplicates: 3, skipped: 24 }),
    ]);

    expect(outcome.allFailed).toBe(false);
    expect(outcome.message).toBe(
      "Found 60 adverts on Adzuna and Careerjet. 44 did not match your words and were skipped." +
        " Kept 16: 6 new, 7 already stored (refreshed), 3 duplicates of other listings.",
    );
  });

  // The case that went unreported: one source fails, another works.
  it("names the failing source and the reason when another source worked", () => {
    const outcome = describeIngest([
      result("adzuna", { received: 7, created: 7 }),
      result("careerjet", { error: CAREERJET_403 }),
    ]);

    expect(outcome.allFailed).toBe(false);
    expect(outcome.message).toContain("Found 7 adverts on Adzuna.");
    expect(outcome.message).toContain("Careerjet could not be searched:");
    expect(outcome.message).toContain("allowed list in your Careerjet publisher account");
    expect(outcome.message).not.toContain("source(s) failed");
  });

  it("is an error, with every reason, when nothing could be searched", () => {
    const outcome = describeIngest([
      result("adzuna", { error: "Could not reach Adzuna" }),
      result("careerjet", { error: CAREERJET_403 }),
    ]);

    expect(outcome.allFailed).toBe(true);
    expect(outcome.message).toContain("Adzuna could not be searched: Could not reach Adzuna");
    expect(outcome.message).toContain("Careerjet could not be searched:");
  });

  it("does not claim a failure when everything worked", () => {
    const outcome = describeIngest([result("adzuna", { received: 3, created: 3 })]);
    expect(outcome.message).not.toContain("could not be searched");
  });

  it("copes with no sources at all", () => {
    expect(describeIngest([])).toEqual({ allFailed: false, message: expect.any(String) });
  });
});
