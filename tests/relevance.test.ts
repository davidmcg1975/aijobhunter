import { describe, expect, it } from "vitest";
import { keywordTerms, matchesKeywords } from "@/lib/jobsources/relevance";

const job = (title: string, description = "") => ({ title, description });

describe("keywordTerms", () => {
  it("splits, lowercases and drops stopwords", () => {
    expect(keywordTerms("Test Analyst and QA")).toEqual(["test", "analyst", "qa"]);
  });

  it("keeps characters that matter in technology names", () => {
    expect(keywordTerms("C# .NET C++ tester")).toEqual(["c#", ".net", "c++", "tester"]);
  });

  it("returns nothing for empty input", () => {
    expect(keywordTerms("")).toEqual([]);
    expect(keywordTerms(undefined)).toEqual([]);
    expect(keywordTerms("  and the  ")).toEqual([]);
  });
});

describe("matchesKeywords - all of these words (the default)", () => {
  // The real cases from a live Careerjet search for "test analyst".
  it("keeps testing roles", () => {
    expect(matchesKeywords(job("Senior Test Analyst"), "test analyst")).toBe(true);
    expect(
      matchesKeywords(job("QA Analyst", "Manual and automated testing of payments"), "test analyst"),
    ).toBe(true);
  });

  it("drops analyst roles with nothing to do with testing", () => {
    expect(matchesKeywords(job("HR Business Analyst - FTC"), "test analyst")).toBe(false);
    expect(matchesKeywords(job("SAP HCM/Payroll Senior Analyst"), "test analyst")).toBe(false);
    expect(matchesKeywords(job("Commercial Finance Analyst"), "test analyst")).toBe(false);
  });

  it("matches the start of a word, so stems count", () => {
    expect(matchesKeywords(job("Analyst - Software Testing"), "test analyst")).toBe(true);
    expect(matchesKeywords(job("Automation Tester", "analyst background"), "test analyst")).toBe(true);
  });

  it("does not match inside another word", () => {
    expect(matchesKeywords(job("Contest Analyst"), "test analyst")).toBe(false);
    expect(matchesKeywords(job("Aquatics Analyst"), "qa analyst")).toBe(false);
  });

  it("finds words in the advert, not just the title", () => {
    expect(
      matchesKeywords(job("Analyst", "You will test the new claims platform"), "test analyst"),
    ).toBe(true);
  });

  it("handles technology names with symbols", () => {
    expect(matchesKeywords(job("C# SDET", "for a .NET platform"), "c# .net")).toBe(true);
    expect(matchesKeywords(job("Java SDET"), "c#")).toBe(false);
  });

  it("keeps everything when there are no search words", () => {
    expect(matchesKeywords(job("Anything at all"), "")).toBe(true);
    expect(matchesKeywords(job("Anything at all"), undefined)).toBe(true);
  });
});

describe("matchesKeywords - a search word must be in the title", () => {
  // Real adverts from a live search that contain both words, but not as a role.
  it("drops adverts that only mention the words in passing", () => {
    expect(
      matchesKeywords(
        job("Media Manager", "an advantage that stands the test of time (syndicated, proprietary, analyst data)"),
        "test analyst",
      ),
    ).toBe(false);
    expect(
      matchesKeywords(
        job("Nuclear Engineer - Fully Remote", "Develop prompts that test AI models. Experience as a Safeguards Analyst"),
        "test analyst",
      ),
    ).toBe(false);
  });

  it("keeps roles with one word in the title and the other in the advert", () => {
    expect(matchesKeywords(job("QA Analyst", "Manual and automated testing"), "test analyst")).toBe(true);
    expect(matchesKeywords(job("Software Tester", "Working with the analyst team"), "test analyst")).toBe(true);
  });

  it("does not apply the title rule to 'any' or 'phrase'", () => {
    expect(matchesKeywords(job("Media Manager", "analyst data"), "test analyst", "any")).toBe(true);
    expect(matchesKeywords(job("Graduate Scheme", "Join as a test analyst"), "test analyst", "phrase")).toBe(true);
  });
});

describe("matchesKeywords - other modes", () => {
  it("any: one word is enough", () => {
    expect(matchesKeywords(job("HR Business Analyst"), "test analyst", "any")).toBe(true);
    expect(matchesKeywords(job("Media Manager"), "test analyst", "any")).toBe(false);
  });

  it("phrase: the words together, in order", () => {
    expect(matchesKeywords(job("Senior Test Analyst"), "test analyst", "phrase")).toBe(true);
    expect(matchesKeywords(job("Senior Test-Analyst"), "test analyst", "phrase")).toBe(true);
    expect(matchesKeywords(job("Analyst who will test"), "test analyst", "phrase")).toBe(false);
  });
});
