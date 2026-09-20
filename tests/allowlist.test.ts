import { describe, expect, it } from "vitest";
import {
  isEmailAllowedToSignUp,
  isSignupRestricted,
  parseAllowedEmails,
} from "@/lib/auth/allowlist";

const TWO_USERS = "daveamcguinness@gmail.com,david.hallowell@gmail.com";

describe("parseAllowedEmails", () => {
  it("splits on commas", () => {
    expect(parseAllowedEmails(TWO_USERS)).toEqual([
      "daveamcguinness@gmail.com",
      "david.hallowell@gmail.com",
    ]);
  });

  it("tolerates spaces and newlines around entries", () => {
    expect(parseAllowedEmails("  a@b.com ,\n c@d.com  ")).toEqual([
      "a@b.com",
      "c@d.com",
    ]);
  });

  it("lower-cases entries so the list is not case-sensitive", () => {
    expect(parseAllowedEmails("Dave@Example.COM")).toEqual(["dave@example.com"]);
  });

  it("treats an empty or whitespace-only value as no list", () => {
    expect(parseAllowedEmails("")).toEqual([]);
    expect(parseAllowedEmails("   ")).toEqual([]);
  });
});

describe("isEmailAllowedToSignUp", () => {
  it("admits a listed address", () => {
    expect(isEmailAllowedToSignUp("daveamcguinness@gmail.com", TWO_USERS)).toBe(true);
    expect(isEmailAllowedToSignUp("david.hallowell@gmail.com", TWO_USERS)).toBe(true);
  });

  it("refuses anyone else", () => {
    expect(isEmailAllowedToSignUp("someone@else.com", TWO_USERS)).toBe(false);
  });

  it("ignores case and surrounding whitespace on the submitted address", () => {
    expect(isEmailAllowedToSignUp("  DaveAMcGuinness@Gmail.com ", TWO_USERS)).toBe(true);
  });

  // Gmail treats these as the same inbox; we deliberately do not, because
  // matching loosely would widen the list in ways that are hard to reason about.
  it("does not treat a plus-address as the listed address", () => {
    expect(isEmailAllowedToSignUp("daveamcguinness+test@gmail.com", TWO_USERS)).toBe(
      false,
    );
  });

  it("is open when no list is configured", () => {
    expect(isEmailAllowedToSignUp("anyone@anywhere.com", "")).toBe(true);
  });
});

describe("isSignupRestricted", () => {
  it("reports the mode so the interface can say which it is in", () => {
    expect(isSignupRestricted(TWO_USERS)).toBe(true);
    expect(isSignupRestricted("")).toBe(false);
  });
});
