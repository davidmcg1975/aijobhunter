import { describe, expect, it } from "vitest";
import { verifyGrounding, type GroundingSource } from "@/lib/ai/grounding";

const source: GroundingSource = {
  text: `
    Senior Test Analyst, Barclays, 2018 to present.
    Built a Selenium regression suite in Java, running on Jenkins.
    Reduced regression time by 40%.
    Test Analyst, Sky, 2015 to 2018. Manual and API testing.
    ISTQB Foundation certified. BSc Computer Science.
  `,
  employers: ["Barclays", "Sky"],
  qualifications: ["ISTQB Foundation", "BSc Computer Science"],
};

describe("verifyGrounding", () => {
  it("passes text that only restates the source", () => {
    const report = verifyGrounding(
      "Senior Test Analyst at Barclays since 2018, building Selenium suites in Java on Jenkins. Previously at Sky from 2015.",
      source,
    );
    expect(report.passed).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  it("catches an invented technology", () => {
    const report = verifyGrounding(
      "Senior Test Analyst at Barclays using Selenium and Playwright since 2018. Previously Sky, 2015.",
      source,
    );
    expect(report.passed).toBe(false);
    expect(report.violations).toContainEqual(
      expect.objectContaining({ kind: "technology", value: "Playwright" }),
    );
  });

  it("catches an invented date", () => {
    const report = verifyGrounding(
      "Senior Test Analyst at Barclays, 2012 to present. Sky 2015.",
      source,
    );
    expect(report.violations).toContainEqual(
      expect.objectContaining({ kind: "date", value: "2012" }),
    );
  });

  it("catches an inflated metric", () => {
    const report = verifyGrounding(
      "At Barclays since 2018 I reduced regression time by 90%. Sky, 2015.",
      source,
    );
    expect(report.violations).toContainEqual(
      expect.objectContaining({ kind: "metric", value: "90%" }),
    );
  });

  it("accepts a metric that is genuinely in the source", () => {
    const report = verifyGrounding(
      "At Barclays since 2018 I reduced regression time by 40%. Sky, 2015.",
      source,
    );
    expect(
      report.violations.filter((v) => v.kind === "metric"),
    ).toHaveLength(0);
  });

  it("catches an invented qualification", () => {
    const report = verifyGrounding(
      "Barclays 2018, Sky 2015. MSc Software Engineering, ISTQB Foundation.",
      source,
    );
    expect(report.violations).toContainEqual(
      expect.objectContaining({ kind: "qualification" }),
    );
  });

  it("reports a dropped employer as an omission, not a violation", () => {
    const report = verifyGrounding(
      "Senior Test Analyst at Barclays since 2018 using Selenium, Java and Jenkins.",
      source,
    );
    expect(report.omissions).toContain("Sky");
    expect(report.violations.some((v) => v.kind === "employer")).toBe(false);
  });

  it("does not double-report the same invention", () => {
    const report = verifyGrounding(
      "Playwright, Playwright, Playwright. Barclays 2018. Sky 2015.",
      source,
    );
    const playwright = report.violations.filter((v) => v.value === "Playwright");
    expect(playwright).toHaveLength(1);
  });

  it("tolerates company suffix differences when checking omissions", () => {
    const report = verifyGrounding("Worked at Barclays Ltd and Sky.", {
      ...source,
      employers: ["Barclays", "Sky"],
    });
    expect(report.omissions).toHaveLength(0);
  });
});
