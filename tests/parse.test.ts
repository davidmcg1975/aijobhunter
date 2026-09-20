import { describe, expect, it } from "vitest";
import {
  detectIr35,
  detectRemote,
  parseContractMonths,
  parseRateFromText,
  normaliseToDayRate,
  providerSalaryToDayRate,
  stripHtml,
} from "@/lib/jobsources/parse";

describe("detectIr35", () => {
  it("reads the common outside phrasings", () => {
    expect(detectIr35("This role is Outside IR35")).toBe("OUTSIDE");
    expect(detectIr35("Determined to be outside of IR35")).toBe("OUTSIDE");
    expect(detectIr35("IR35: Outside")).toBe("OUTSIDE");
    expect(detectIr35("Sits outside the scope of IR35")).toBe("OUTSIDE");
  });

  it("reads the common inside phrasings", () => {
    expect(detectIr35("This contract is Inside IR35")).toBe("INSIDE");
    expect(detectIr35("Falls within the scope of IR35")).toBe("INSIDE");
    expect(detectIr35("Umbrella only engagement")).toBe("INSIDE");
    expect(detectIr35("IR35 - Inside")).toBe("INSIDE");
  });

  it("tolerates spacing and hyphen variants", () => {
    expect(detectIr35("outside IR 35")).toBe("OUTSIDE");
    expect(detectIr35("outside ir-35")).toBe("OUTSIDE");
  });

  // A wrong IR35 label costs the contractor real money, so ambiguity must
  // never resolve to a guess.
  it("refuses to guess when the advert says both", () => {
    expect(
      detectIr35("Could be inside IR35 or outside IR35 depending on the client"),
    ).toBe("UNKNOWN");
  });

  it("returns UNKNOWN when IR35 is not mentioned", () => {
    expect(detectIr35("Senior Test Analyst needed in London")).toBe("UNKNOWN");
  });
});

describe("detectRemote", () => {
  it("detects hybrid", () => {
    expect(detectRemote("Hybrid working, 2 days per week on-site")).toBe("HYBRID");
    expect(detectRemote("3 days a week onsite")).toBe("HYBRID");
    expect(detectRemote("2 days a week in the office")).toBe("HYBRID");
  });

  // The day count decides it - five days on site is not hybrid.
  it("reads five days a week as on-site, not hybrid", () => {
    expect(detectRemote("5 days a week in the office")).toBe("ONSITE");
    expect(detectRemote("5 days per week onsite")).toBe("ONSITE");
  });

  it("detects fully remote", () => {
    expect(detectRemote("This is a fully remote position")).toBe("REMOTE");
    expect(detectRemote("100% remote")).toBe("REMOTE");
    expect(detectRemote("Remote-first team")).toBe("REMOTE");
  });

  it("does not read a negated mention as remote", () => {
    expect(detectRemote("This role is not remote")).not.toBe("REMOTE");
  });

  it("detects on-site", () => {
    expect(detectRemote("Fully office based role")).toBe("ONSITE");
  });

  it("returns UNKNOWN when nothing is said", () => {
    expect(detectRemote("Test Analyst wanted")).toBe("UNKNOWN");
  });
});

describe("parseRateFromText", () => {
  it("reads an explicit day rate range", () => {
    expect(parseRateFromText("£500 - £550 per day")).toEqual({
      min: 500,
      max: 550,
      period: "DAY",
    });
  });

  it("reads a single day rate", () => {
    expect(parseRateFromText("Paying £525/day")).toEqual({
      min: 525,
      max: null,
      period: "DAY",
    });
  });

  it("treats a bare figure in day-rate range as a day rate", () => {
    const result = parseRateFromText("Rate: £450");
    expect(result.period).toBe("DAY");
    expect(result.min).toBe(450);
  });

  it("reads annual salaries with a k suffix", () => {
    const result = parseRateFromText("£65k per annum");
    expect(result.period).toBe("YEAR");
    expect(result.min).toBe(65000);
  });

  it("prefers an explicit day rate over an annual figure", () => {
    const result = parseRateFromText(
      "Permanent equivalent £80,000 per annum. Contract rate £600 per day.",
    );
    expect(result.period).toBe("DAY");
    expect(result.min).toBe(600);
  });

  it("returns UNKNOWN when there is no rate", () => {
    expect(parseRateFromText("Competitive rate").period).toBe("UNKNOWN");
  });
});

describe("normaliseToDayRate", () => {
  it("converts an annual salary using 220 working days", () => {
    expect(normaliseToDayRate(110_000, "YEAR")).toBe(500);
  });

  it("converts an hourly rate over a 7.5 hour day", () => {
    expect(normaliseToDayRate(60, "HOUR")).toBe(450);
  });

  it("passes a day rate through", () => {
    expect(normaliseToDayRate(525, "DAY")).toBe(525);
  });

  it("returns null for unknown periods", () => {
    expect(normaliseToDayRate(500, "UNKNOWN")).toBeNull();
  });
});

// Regression tests for a bug found against the live Adzuna API: two adverts
// both tagged contract_type=contract reported salary_min as 130000 (annualised)
// and 300 (already a day rate). Dividing both by 220 turned the second into
// £1/day.
describe("providerSalaryToDayRate", () => {
  it("converts an annualised figure", () => {
    expect(providerSalaryToDayRate(130_000)).toBe(591);
    expect(providerSalaryToDayRate(110_000)).toBe(500);
  });

  it("passes through a figure that is already a day rate", () => {
    expect(providerSalaryToDayRate(300)).toBe(300);
    expect(providerSalaryToDayRate(325)).toBe(325);
    expect(providerSalaryToDayRate(1250)).toBe(1250);
  });

  it("treats a small figure as an hourly rate", () => {
    expect(providerSalaryToDayRate(60)).toBe(450);
  });

  it("refuses to guess in the ambiguous band", () => {
    // Too high for a day rate, too low for a UK IT annual salary.
    expect(providerSalaryToDayRate(8000)).toBeNull();
  });

  it("handles missing and nonsense values", () => {
    expect(providerSalaryToDayRate(null)).toBeNull();
    expect(providerSalaryToDayRate(0)).toBeNull();
    expect(providerSalaryToDayRate(-5)).toBeNull();
    expect(providerSalaryToDayRate(Number.NaN)).toBeNull();
  });

  it("never returns an absurd day rate", () => {
    for (const input of [130_000, 300, 60, 49_502, 39_073.82, 156_000]) {
      const result = providerSalaryToDayRate(input);
      if (result !== null) {
        expect(result).toBeGreaterThan(20);
        expect(result).toBeLessThan(3000);
      }
    }
  });
});

describe("parseContractMonths", () => {
  it("reads months", () => {
    expect(parseContractMonths("6 month contract")).toBe(6);
    expect(parseContractMonths("12 months initially")).toBe(12);
  });

  it("converts weeks", () => {
    expect(parseContractMonths("26 weeks")).toBe(6);
  });

  it("converts years", () => {
    expect(parseContractMonths("2 year contract")).toBe(24);
  });

  it("returns null when not stated", () => {
    expect(parseContractMonths("Ongoing requirement")).toBeNull();
  });
});

describe("stripHtml", () => {
  it("turns markup into readable text", () => {
    const html = "<p>We need a <strong>Test Analyst</strong></p><ul><li>Selenium</li></ul>";
    const text = stripHtml(html);
    expect(text).toContain("Test Analyst");
    expect(text).toContain("Selenium");
    expect(text).not.toContain("<");
  });

  it("decodes entities", () => {
    expect(stripHtml("Testing &amp; QA")).toBe("Testing & QA");
  });

  it("drops script and style content", () => {
    expect(stripHtml("<script>alert(1)</script>Hello")).toBe("Hello");
  });
});
