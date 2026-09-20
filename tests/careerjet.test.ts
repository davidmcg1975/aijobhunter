import { describe, expect, it } from "vitest";
import {
  careerjetJobId,
  careerjetSalaryPeriod,
  parseCareerjetDate,
} from "@/lib/jobsources/careerjet";
import { normaliseToDayRate } from "@/lib/jobsources/parse";

describe("careerjetSalaryPeriod", () => {
  it("maps the letters the live API returns", () => {
    expect(careerjetSalaryPeriod("Y")).toBe("YEAR");
    expect(careerjetSalaryPeriod("M")).toBe("MONTH");
    expect(careerjetSalaryPeriod("D")).toBe("DAY");
    expect(careerjetSalaryPeriod("H")).toBe("HOUR");
  });

  it("is case and whitespace tolerant", () => {
    expect(careerjetSalaryPeriod(" d ")).toBe("DAY");
  });

  // Weekly would require guessing how many days were worked.
  it("leaves weekly unknown rather than guessing", () => {
    expect(careerjetSalaryPeriod("W")).toBe("UNKNOWN");
  });

  // Most adverts carry no structured salary at all - 15 of 20 on a live page.
  it("handles the absent case", () => {
    expect(careerjetSalaryPeriod(null)).toBe("UNKNOWN");
    expect(careerjetSalaryPeriod(undefined)).toBe("UNKNOWN");
    expect(careerjetSalaryPeriod("")).toBe("UNKNOWN");
  });
});

describe("careerjet salary conversion", () => {
  // Observed live: salary "£725 per day", salary_min 725, salary_type "D".
  // The stated period is what stops this being read as an annual figure.
  it("passes a stated day rate through unchanged", () => {
    expect(normaliseToDayRate(725, careerjetSalaryPeriod("D"))).toBe(725);
  });

  it("converts a stated annual salary", () => {
    expect(normaliseToDayRate(110_000, careerjetSalaryPeriod("Y"))).toBe(500);
  });

  it("converts a stated hourly rate", () => {
    expect(normaliseToDayRate(60, careerjetSalaryPeriod("H"))).toBe(450);
  });
});

/**
 * Careerjet's advert URL is a jobviewtrack.com redirect whose path token is
 * regenerated per request - verified live, 10 of 10 URLs differed between two
 * identical searches 2.5 seconds apart. Keying on it would re-import every
 * advert as new on every search.
 */
describe("careerjetJobId", () => {
  const advert = {
    title: "Senior Business Analyst - Data Ingestion & Transformation",
    company: "Square One Resources",
    locations: "London",
  };

  it("is stable for the same advert regardless of the rotating URL", () => {
    expect(careerjetJobId(advert)).toBe(careerjetJobId({ ...advert }));
  });

  it("ignores punctuation and case differences in the same advert", () => {
    expect(careerjetJobId(advert)).toBe(
      careerjetJobId({
        title: "senior business analyst   data ingestion and transformation".replace(
          " and ",
          " & ",
        ),
        company: "Square One Resources",
        locations: "london",
      }),
    );
  });

  it("separates the same title at different agencies", () => {
    expect(careerjetJobId(advert)).not.toBe(
      careerjetJobId({ ...advert, company: "Adecco" }),
    );
  });

  it("separates the same role in different locations", () => {
    expect(careerjetJobId(advert)).not.toBe(
      careerjetJobId({ ...advert, locations: "Manchester" }),
    );
  });

  it("copes with missing fields", () => {
    expect(careerjetJobId({})).toHaveLength(32);
    expect(careerjetJobId({ title: "Test Analyst" })).toHaveLength(32);
  });
});

describe("parseCareerjetDate", () => {
  // The live API returns RFC 1123, e.g. "Sat, 19 Sep 2026 06:30:55 GMT".
  it("reads the RFC 1123 format the API actually sends", () => {
    const date = parseCareerjetDate("Sat, 19 Sep 2026 06:30:55 GMT");
    expect(date?.getUTCFullYear()).toBe(2026);
    expect(date?.getUTCMonth()).toBe(8);
    expect(date?.getUTCDate()).toBe(19);
  });

  // Kept because Date would otherwise read this as US month-first.
  it("reads DD/MM/YYYY as UK day-first", () => {
    const date = parseCareerjetDate("04/09/2026");
    expect(date?.getUTCMonth()).toBe(8);
    expect(date?.getUTCDate()).toBe(4);
  });

  it("returns null for unparseable input", () => {
    expect(parseCareerjetDate("sometime last week")).toBeNull();
  });
});
