import { describe, expect, it } from "vitest";
import {
  fingerprint,
  findDuplicate,
  normaliseCompany,
  normaliseTitle,
  similarity,
} from "@/lib/jobsources/dedupe";

describe("normaliseTitle", () => {
  it("strips recruiter noise", () => {
    expect(normaliseTitle("URGENT! Senior Test Analyst (Contract) - Outside IR35")).toBe(
      normaliseTitle("Senior Test Analyst"),
    );
  });

  it("is order independent", () => {
    expect(normaliseTitle("Test Analyst Senior")).toBe(normaliseTitle("Senior Test Analyst"));
  });

  it("distinguishes genuinely different titles", () => {
    expect(normaliseTitle("Senior Test Analyst")).not.toBe(
      normaliseTitle("Performance Test Engineer"),
    );
  });
});

describe("normaliseCompany", () => {
  it("ignores legal suffixes", () => {
    expect(normaliseCompany("Acme Recruitment Ltd")).toBe(normaliseCompany("Acme"));
  });

  it("handles a missing company", () => {
    expect(normaliseCompany(null)).toBe("");
  });
});

describe("fingerprint", () => {
  it("matches the same job posted with different decoration", () => {
    const a = fingerprint({
      title: "Senior Test Analyst - Outside IR35",
      company: "Acme Ltd",
      location: "London, South East England",
    });
    const b = fingerprint({
      title: "URGENT: Senior Test Analyst (Contract)",
      company: "Acme",
      location: "London",
    });
    expect(a).toBe(b);
  });

  it("separates the same title at different clients", () => {
    const a = fingerprint({ title: "Test Analyst", company: "Acme", location: "London" });
    const b = fingerprint({ title: "Test Analyst", company: "Globex", location: "London" });
    expect(a).not.toBe(b);
  });
});

describe("similarity", () => {
  it("is 1 for identical text", () => {
    const text = "Selenium automation engineer working on regression suites";
    expect(similarity(text, text)).toBe(1);
  });

  it("is low for unrelated text", () => {
    expect(
      similarity(
        "Selenium automation engineer regression suites",
        "Chartered accountant preparing statutory financial statements",
      ),
    ).toBeLessThan(0.2);
  });
});

describe("findDuplicate", () => {
  const description =
    "We are seeking a Senior Test Analyst to lead regression testing across our trading platform using Selenium and Java.";

  it("matches the same advert from the same source on its id", () => {
    const id = findDuplicate(
      { source: "adzuna", sourceJobId: "123", description: "totally different text" },
      [
        {
          id: "job-1",
          source: "adzuna",
          sourceJobId: "123",
          description: "totally different text",
          url: "https://example.com/1",
        },
      ],
    );
    expect(id).toBe("job-1");
  });

  it("matches a cross-posted advert on description similarity", () => {
    const id = findDuplicate(
      { source: "reed", sourceJobId: "999", description },
      [
        {
          id: "job-1",
          source: "adzuna",
          sourceJobId: "123",
          description: `${description} Apply now.`,
          url: "https://example.com/1",
        },
      ],
    );
    expect(id).toBe("job-1");
  });

  it("does not merge different roles that share a fingerprint", () => {
    const id = findDuplicate(
      { source: "reed", sourceJobId: "999", description },
      [
        {
          id: "job-1",
          source: "adzuna",
          sourceJobId: "123",
          description:
            "Chartered accountant required to prepare statutory financial statements and manage audit relationships.",
          url: "https://example.com/1",
        },
      ],
    );
    expect(id).toBeNull();
  });

  it("returns null when there are no candidates", () => {
    expect(findDuplicate({ source: "adzuna", sourceJobId: "1", description }, [])).toBeNull();
  });
});
