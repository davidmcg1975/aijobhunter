import { describe, expect, it } from "vitest";
import {
  buildManualDraft,
  validateManualJob,
  MIN_ADVERT_LENGTH,
  type ManualJobInput,
} from "@/lib/jobsources/manual";
import { ownedJob, sharedOnly, visibleToUser } from "@/lib/jobsources/visibility";

const ADVERT = `
Test Analyst - Insurance claims platform
Harrow, hybrid two days on site. 6 month contract, outside IR35.
Rate £450 - £525 per day depending on experience.

You will own functional and regression testing for a claims platform, writing
test cases from business requirements, running defect triage with developers
and reporting progress to the programme manager. Experience of Jira, SQL and
API testing with Postman is essential.
`.trim();

const BLANK: ManualJobInput = {
  advert: ADVERT,
  title: "",
  company: "",
  location: "",
  url: "",
  rateMin: "",
  rateMax: "",
  ir35: "",
  remote: "",
};

describe("buildManualDraft", () => {
  it("uses what the AI read out of the advert", () => {
    const draft = buildManualDraft(ADVERT, {
      title: "Test Analyst",
      company: "Acme Insurance",
      location: "Harrow",
      dayRateMin: 450,
      dayRateMax: 525,
      ir35: "OUTSIDE",
      remote: "HYBRID",
    });

    expect(draft).toMatchObject({
      title: "Test Analyst",
      company: "Acme Insurance",
      location: "Harrow",
      rateMin: 450,
      rateMax: 525,
      ir35: "OUTSIDE",
      remote: "HYBRID",
    });
  });

  // The feature has to work with no AI key at all.
  it("falls back to reading the advert itself", () => {
    const draft = buildManualDraft(ADVERT);

    expect(draft.title).toBe("");
    expect(draft.ir35).toBe("OUTSIDE");
    expect(draft.remote).toBe("HYBRID");
    expect(draft.rateMin).toBe(450);
    expect(draft.rateMax).toBe(525);
    expect(draft.contractMonths).toBe(6);
  });

  it("ignores a rate the model invented or mangled", () => {
    const draft = buildManualDraft("A short advert with no rate in it at all.", {
      dayRateMin: 4,
      dayRateMax: 9_000_000,
    });
    expect(draft.rateMin).toBeNull();
    expect(draft.rateMax).toBeNull();
  });

  it("ignores values outside the allowed sets", () => {
    const draft = buildManualDraft("Advert text.", { ir35: "maybe", remote: "sometimes" });
    expect(draft.ir35).toBe("UNKNOWN");
    expect(draft.remote).toBe("UNKNOWN");
  });

  it("tidies whitespace out of what the model returned", () => {
    const draft = buildManualDraft(ADVERT, { title: "  Test   Analyst \n" });
    expect(draft.title).toBe("Test Analyst");
  });
});

describe("validateManualJob", () => {
  it("accepts a complete job and keeps the whole advert", () => {
    const result = validateManualJob({
      ...BLANK,
      title: "Test Analyst",
      company: "Acme Insurance",
      location: "Harrow",
      url: "https://example.com/jobs/1",
      rateMin: "450",
      rateMax: "525",
      ir35: "OUTSIDE",
      remote: "HYBRID",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job).toMatchObject({
      title: "Test Analyst",
      salaryMin: 450,
      salaryMax: 525,
      salaryPeriod: "DAY",
      contractType: "CONTRACT",
      ir35: "OUTSIDE",
      remote: "HYBRID",
    });
    expect(result.job.advert).toContain("regression testing");
  });

  it("insists on the advert, because the score is built from it", () => {
    const result = validateManualJob({ ...BLANK, advert: "Test Analyst, London", title: "T" });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("whole advert") });
  });

  it("insists on a job title", () => {
    expect(validateManualJob(BLANK)).toEqual({ ok: false, error: "Give the job a title." });
  });

  it("accepts a job with no rate, and says the period is unknown", () => {
    const result = validateManualJob({ ...BLANK, title: "Test Analyst" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job).toMatchObject({ salaryMin: null, salaryMax: null, salaryPeriod: "UNKNOWN" });
  });

  it("reads a rate typed with a pound sign or commas", () => {
    const result = validateManualJob({ ...BLANK, title: "T", rateMin: "£1,100" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job.salaryMin).toBe(1100);
  });

  it("rejects a reversed rate range", () => {
    const result = validateManualJob({ ...BLANK, title: "T", rateMin: "600", rateMax: "400" });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("higher than the highest") });
  });

  it("rejects nonsense in a rate field", () => {
    const result = validateManualJob({ ...BLANK, title: "T", rateMin: "lots" });
    expect(result.ok).toBe(false);
  });

  it("rejects a link that is not a link, but allows none", () => {
    expect(validateManualJob({ ...BLANK, title: "T", url: "jobs.example.com" }).ok).toBe(false);
    expect(validateManualJob({ ...BLANK, title: "T", url: "" }).ok).toBe(true);
  });

  it("falls back to reading IR35 and working arrangement from the advert", () => {
    const result = validateManualJob({ ...BLANK, title: "T" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job.ir35).toBe("OUTSIDE");
    expect(result.job.remote).toBe("HYBRID");
  });

  it("treats an advert on the length limit as long enough", () => {
    const result = validateManualJob({
      ...BLANK,
      title: "T",
      advert: "x".repeat(MIN_ADVERT_LENGTH),
    });
    expect(result.ok).toBe(true);
  });
});

// A manually added job may come from a recruiter's email, so it is private.
describe("job visibility", () => {
  it("shows a user shared jobs and their own, and nobody else's", () => {
    expect(visibleToUser("user_1")).toEqual({
      OR: [{ addedByUserId: null }, { addedByUserId: "user_1" }],
    });
  });

  it("scopes a by-id lookup to the same rule", () => {
    expect(ownedJob("job_1", "user_1")).toEqual({
      id: "job_1",
      OR: [{ addedByUserId: null }, { addedByUserId: "user_1" }],
    });
  });

  it("limits background work to shared jobs only", () => {
    expect(sharedOnly).toEqual({ addedByUserId: null });
  });
});
