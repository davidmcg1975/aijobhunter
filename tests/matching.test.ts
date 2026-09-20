import { describe, expect, it } from "vitest";
import { scoreMatch, type MatchJob, type MatchProfile } from "@/lib/matching/engine";
import {
  canonicaliseList,
  canonicaliseSkill,
  extractSkills,
  isRelated,
} from "@/lib/matching/skills";
import { WEIGHTS } from "@/lib/matching/types";

function profile(overrides: Partial<MatchProfile> = {}): MatchProfile {
  return {
    jobTitles: ["Senior Test Analyst"],
    yearsExperience: 8,
    industries: ["Financial Services"],
    technologies: ["Selenium", "Java", "Jenkins"],
    testingMethodologies: ["Agile", "BDD"],
    aiTestingSkills: [],
    certifications: ["ISTQB"],
    managementExperience: "Led a team of four testers",
    minDayRate: 450,
    preferredDayRate: 500,
    maxCommuteMiles: 30,
    remoteModes: ["HYBRID", "REMOTE"],
    ir35Stances: ["OUTSIDE"],
    location: "London",
    experiences: [
      {
        company: "Barclays",
        jobTitle: "Senior Test Analyst",
        startDate: new Date("2018-01-01"),
        endDate: null,
        industry: "Financial Services",
        responsibilities: ["Led regression testing", "Managed test automation suite"],
        technologies: ["Selenium", "Java"],
        description: "Test automation on a trading platform",
      },
    ],
    cvText: "Senior Test Analyst with Selenium, Java, Jenkins and Agile experience.",
    ...overrides,
  };
}

function job(overrides: Partial<MatchJob> = {}): MatchJob {
  return {
    title: "Senior Test Analyst",
    location: "London",
    description: "Senior Test Analyst needed. 5+ years experience required.",
    salaryMin: 500,
    salaryMax: 550,
    salaryPeriod: "DAY",
    remote: "HYBRID",
    ir35: "OUTSIDE",
    analysis: {
      requiredSkills: ["Selenium", "Agile"],
      desirableSkills: ["Playwright"],
      responsibilities: ["Lead regression testing across the platform"],
      technologies: ["Selenium", "Java"],
      testingMethodologies: ["Agile"],
      aiTestingSkills: [],
      industry: "Financial Services",
      seniority: "Senior",
      inferredRateMin: 500,
      inferredRateMax: 550,
      inferredLengthMonths: 6,
    },
    ...overrides,
  };
}

describe("scoreMatch", () => {
  it("scores a strong match highly", () => {
    const result = scoreMatch(profile(), job());
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.recommendation).toBe("STRONG_MATCH");
  });

  it("scores a poor match low", () => {
    const result = scoreMatch(
      profile({
        technologies: ["COBOL"],
        testingMethodologies: [],
        certifications: [],
        industries: ["Agriculture"],
        jobTitles: ["Junior Data Entry Clerk"],
        yearsExperience: 1,
        experiences: [],
        cvText: "Data entry work using COBOL.",
        ir35Stances: ["INSIDE"],
        minDayRate: 900,
        preferredDayRate: 950,
      }),
      job(),
    );
    expect(result.score).toBeLessThan(50);
    expect(result.recommendation).toBe("WEAK_MATCH");
  });

  it("always returns a breakdown that explains the score", () => {
    const result = scoreMatch(profile(), job());
    expect(result.dimensions).toHaveLength(8);
    for (const dimension of result.dimensions) {
      expect(dimension.explanation).toBeTruthy();
      expect(dimension.weight).toBe(WEIGHTS[dimension.key]);
    }
  });

  // "Not mentioned" must never be reported as "cannot do".
  it("labels missing evidence as not evidenced, not as a deficiency", () => {
    const result = scoreMatch(profile(), job());
    const playwright = result.dimensions
      .find((d) => d.key === "technicalSkills")!
      .evidence.find((e) => e.requirement === "Playwright");

    expect(playwright).toBeDefined();
    // Selenium is related to Playwright, so this is an inference, not a gap.
    expect(playwright!.level).toBe("INFERRED");
    expect(playwright!.note).toMatch(/related/i);
  });

  it("reports a genuinely absent skill as not evidenced and says so carefully", () => {
    const result = scoreMatch(
      profile({ technologies: ["Selenium"], cvText: "Selenium only." }),
      job({
        analysis: { ...job().analysis!, requiredSkills: ["Selenium", "COBOL"] },
      }),
    );
    const cobol = result.dimensions
      .find((d) => d.key === "technicalSkills")!
      .evidence.find((e) => e.requirement.toLowerCase().includes("cobol"));

    expect(cobol!.level).toBe("NOT_EVIDENCED");
    expect(cobol!.note).toMatch(/does not mean you cannot/i);
  });

  // A sparse advert should not drag down an otherwise good match.
  it("redistributes weight when a dimension cannot be assessed", () => {
    const sparse = scoreMatch(
      profile(),
      job({
        ir35: "UNKNOWN",
        remote: "UNKNOWN",
        analysis: {
          ...job().analysis!,
          industry: null,
          seniority: null,
          responsibilities: [],
          inferredRateMin: null,
          inferredRateMax: null,
        },
        salaryMin: null,
        salaryMax: null,
        salaryPeriod: "UNKNOWN",
      }),
    );

    const indeterminate = sparse.dimensions.filter((d) => d.indeterminate);
    expect(indeterminate.length).toBeGreaterThan(0);
    expect(sparse.effectiveWeightTotal).toBeLessThan(100);
    expect(sparse.unknowns.length).toBe(indeterminate.length);
    // Skills and experience still carry it to a respectable score.
    expect(sparse.score).toBeGreaterThan(60);
  });

  it("scores between 0 and 100 whatever the input", () => {
    const empty = scoreMatch(
      profile({
        jobTitles: [],
        yearsExperience: null,
        industries: [],
        technologies: [],
        testingMethodologies: [],
        certifications: [],
        experiences: [],
        cvText: "",
        remoteModes: [],
        ir35Stances: [],
        minDayRate: null,
        preferredDayRate: null,
      }),
      job({ analysis: null, description: "" }),
    );
    expect(empty.score).toBeGreaterThanOrEqual(0);
    expect(empty.score).toBeLessThanOrEqual(100);
  });

  it("flags when it had to score without an AI analysis", () => {
    const result = scoreMatch(profile(), job({ analysis: null }));
    expect(result.usedFallbackAnalysis).toBe(true);
  });

  it("penalises an IR35 status the user does not accept", () => {
    const outside = scoreMatch(profile(), job());
    const inside = scoreMatch(profile(), job({ ir35: "INSIDE" }));
    expect(inside.score).toBeLessThan(outside.score);
  });

  it("penalises a rate below the user's minimum", () => {
    const good = scoreMatch(profile(), job());
    const poor = scoreMatch(
      profile(),
      job({
        analysis: { ...job().analysis!, inferredRateMin: 250, inferredRateMax: 275 },
      }),
    );
    expect(poor.score).toBeLessThan(good.score);
  });

  it("is deterministic", () => {
    const a = scoreMatch(profile(), job());
    const b = scoreMatch(profile(), job());
    expect(a.score).toBe(b.score);
  });
});

describe("skills taxonomy", () => {
  it("canonicalises aliases", () => {
    expect(canonicaliseSkill("selenium webdriver")).toBe("Selenium");
    expect(canonicaliseSkill("WDIO")).toBe("WebdriverIO");
    expect(canonicaliseSkill("scrum")).toBe("Agile");
  });

  it("returns null for unknown skills", () => {
    expect(canonicaliseSkill("underwater basket weaving")).toBeNull();
  });

  it("finds skills in free text", () => {
    const found = extractSkills("Built a Selenium suite in Java, run on Jenkins.");
    expect(found).toContain("Selenium");
    expect(found).toContain("Java");
    expect(found).toContain("Jenkins");
  });

  it("does not match Java inside JavaScript", () => {
    const found = extractSkills("Wrote JavaScript tests");
    expect(found).toContain("JavaScript");
    expect(found).not.toContain("Java");
  });

  it("recognises the AI testing niche", () => {
    const found = extractSkills(
      "Experience with RAG evaluation, prompt injection testing and hallucination detection.",
    );
    expect(found).toContain("RAG Evaluation");
    expect(found).toContain("Prompt Injection");
    expect(found).toContain("Hallucination Testing");
  });

  it("knows which tools are substitutes", () => {
    expect(isRelated("Selenium", "Playwright")).toBe(true);
    expect(isRelated("Selenium", "COBOL")).toBe(false);
  });
});

// Adverts phrase requirements as sentences. Found live: an AI analysis returned
// "Selenium WebDriver automation", which exact-matching left unrecognised, so a
// candidate with eight years of Selenium scored it as unevidenced.
describe("canonicaliseList", () => {
  it("pulls known skills out of requirement phrases", () => {
    expect(canonicaliseList(["Strong Selenium WebDriver automation experience"])).toContain(
      "Selenium",
    );
    expect(canonicaliseList(["Agile delivery within a Scrum team"])).toContain("Agile");
    expect(canonicaliseList(["Solid experience with Java and Jenkins"])).toEqual(
      expect.arrayContaining(["Java", "Jenkins"]),
    );
  });

  it("still canonicalises a plain skill name", () => {
    expect(canonicaliseList(["selenium webdriver"])).toEqual(["Selenium"]);
  });

  it("keeps a requirement it cannot name, rather than dropping it", () => {
    const result = canonicaliseList(["Experience leading testing on a workstream"]);
    expect(result).toEqual(["Experience leading testing on a workstream"]);
  });

  it("does not duplicate a skill mentioned twice", () => {
    expect(
      canonicaliseList(["Selenium automation", "Selenium WebDriver"]),
    ).toEqual(["Selenium"]);
  });
});

// Found on a live Adzuna search: a broad keyword search returned "AML Analyst"
// for a software tester, and it scored 85% - almost entirely on length of
// service, because the advert named no recognisable skills and that dimension's
// 30% was redistributed across the rest.
describe("scoring when technical skills cannot be assessed", () => {
  const unskilledAdvert = (): MatchJob =>
    job({
      title: "AML Analyst",
      description:
        "AML Analyst required for a growing financial crime team. " +
        "The successful candidate will have 5+ years experience.",
      analysis: null,
    });

  it("caps the score rather than inflating it", () => {
    const result = scoreMatch(profile(), unskilledAdvert());
    const skills = result.dimensions.find((d) => d.key === "technicalSkills")!;

    expect(skills.indeterminate).toBe(true);
    expect(result.score).toBeLessThanOrEqual(60);
  });

  it("says why it was capped", () => {
    const result = scoreMatch(profile(), unskilledAdvert());
    expect(result.cappedAt).toBe(60);
    expect(result.capReason).toMatch(/not evidence of a good fit/i);
  });

  it("never reports a capped score as a strong match", () => {
    const result = scoreMatch(profile(), unskilledAdvert());
    expect(result.recommendation).not.toBe("STRONG_MATCH");
  });

  // The cap must not touch a job whose skills were assessed normally.
  it("leaves a properly assessed score alone", () => {
    const result = scoreMatch(profile(), job());
    expect(result.cappedAt).toBeUndefined();
    expect(result.capReason).toBeUndefined();
    expect(result.score).toBeGreaterThan(60);
  });
});
