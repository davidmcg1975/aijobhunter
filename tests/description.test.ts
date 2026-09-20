import { describe, expect, it } from "vitest";
import {
  effectiveDescription,
  isDescriptionIncomplete,
  tidyPastedDescription,
  validatePastedDescription,
} from "@/lib/jobsources/description";

const extract = "A".repeat(500);
const full = "B".repeat(3000);

describe("effectiveDescription", () => {
  it("prefers the pasted full advert", () => {
    expect(
      effectiveDescription({ description: extract, fullDescription: full }),
    ).toBe(full);
  });

  it("falls back to the provider extract", () => {
    expect(effectiveDescription({ description: extract })).toBe(extract);
    expect(
      effectiveDescription({ description: extract, fullDescription: null }),
    ).toBe(extract);
  });

  it("ignores whitespace-only pasted text", () => {
    expect(
      effectiveDescription({ description: extract, fullDescription: "   \n  " }),
    ).toBe(extract);
  });
});

describe("isDescriptionIncomplete", () => {
  it("is true for a truncated advert with nothing pasted", () => {
    expect(
      isDescriptionIncomplete({ description: extract, descriptionTruncated: true }),
    ).toBe(true);
  });

  it("is false once the full advert has been pasted", () => {
    expect(
      isDescriptionIncomplete({
        description: extract,
        descriptionTruncated: true,
        fullDescription: full,
      }),
    ).toBe(false);
  });

  it("is false when the provider gave the whole advert", () => {
    expect(
      isDescriptionIncomplete({ description: full, descriptionTruncated: false }),
    ).toBe(false);
  });
});

describe("validatePastedDescription", () => {
  it("accepts a full advert", () => {
    expect(validatePastedDescription(full, extract)).toBeNull();
  });

  it("rejects empty input", () => {
    expect(validatePastedDescription("   ", extract)).toMatch(/paste the advert/i);
  });

  it("rejects a snippet shorter than the minimum", () => {
    expect(validatePastedDescription("Too short", extract)).toMatch(/whole advert/i);
  });

  // Accepting less text than we already have would look like an improvement
  // while making every downstream score worse.
  it("rejects text shorter than what is already stored", () => {
    const shorter = "C".repeat(300);
    expect(validatePastedDescription(shorter, extract)).toMatch(/lose detail/i);
  });

  it("rejects an implausibly long paste", () => {
    expect(validatePastedDescription("D".repeat(70_000), extract)).toMatch(
      /longer than any job advert/i,
    );
  });
});

describe("tidyPastedDescription", () => {
  it("collapses the blank lines web copy produces", () => {
    expect(tidyPastedDescription("Line one\n\n\n\nLine two")).toBe(
      "Line one\n\nLine two",
    );
  });

  it("normalises non-breaking spaces and trailing whitespace", () => {
    expect(tidyPastedDescription("Rate:  £500   \nPer day  ")).toBe(
      "Rate: £500\nPer day",
    );
  });

  it("keeps the advert's own structure", () => {
    const advert = "Essential:\n- Selenium\n- Java\n\nDesirable:\n- Playwright";
    expect(tidyPastedDescription(advert)).toBe(advert);
  });
});
