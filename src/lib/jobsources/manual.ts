import {
  detectIr35,
  detectRemote,
  parseRateFromText,
  parseContractMonths,
} from "./parse";
import type { ContractType, Ir35Status, RemoteType, SalaryPeriod } from "./types";

/**
 * Jobs a user found somewhere this application cannot search - LinkedIn, an
 * agency's own site, a recruiter's email - and added by hand.
 *
 * Not a JobSource: there is nothing to search, so it is deliberately not in
 * the registry. It produces the same normalised shape, so everything
 * downstream (analysis, scoring, tailoring) treats it like any other advert.
 *
 * Pure. The AI reads what it can out of the advert and the deterministic
 * parsers fill the gaps, which also means the feature still works with no AI
 * key at all - the user just types more in.
 */

export const MANUAL_SOURCE = "manual";

/** Long enough to be a real advert rather than a job title someone pasted. */
export const MIN_ADVERT_LENGTH = 200;
export const MAX_ADVERT_LENGTH = 60_000;

export type ManualJobInput = {
  advert: string;
  title: string;
  company: string;
  location: string;
  url: string;
  /** Day rate in whole pounds. */
  rateMin: string;
  rateMax: string;
  ir35: string;
  remote: string;
};

export type ManualJobDraft = {
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  rateMin: number | null;
  rateMax: number | null;
  ir35: Ir35Status;
  remote: RemoteType;
  contractMonths: number | null;
};

/** What the AI is asked to pull out of the advert. Everything is optional. */
export type AiJobDetails = Partial<{
  title: string | null;
  company: string | null;
  location: string | null;
  dayRateMin: number | null;
  dayRateMax: number | null;
  ir35: string | null;
  remote: string | null;
}>;

function cleanLine(value: unknown, max = 200): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function asIr35(value: unknown): Ir35Status | null {
  const v = cleanLine(value).toUpperCase();
  return v === "INSIDE" || v === "OUTSIDE" ? v : null;
}

function asRemote(value: unknown): RemoteType | null {
  const v = cleanLine(value).toUpperCase();
  return v === "REMOTE" || v === "HYBRID" || v === "ONSITE" ? v : null;
}

/** A day rate a human would recognise; anything else is ignored rather than shown. */
function asDayRate(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= 50 && rounded <= 5000 ? rounded : null;
}

/**
 * The form's starting values: the AI's reading of the advert, with the
 * deterministic parsers filling anything it left blank. The user confirms or
 * corrects all of it before anything is saved.
 */
export function buildManualDraft(advert: string, ai: AiJobDetails = {}): ManualJobDraft {
  const text = advert.trim();
  const parsedRate = parseRateFromText(text);
  const location = cleanLine(ai.location, 120) || null;

  const aiMin = asDayRate(ai.dayRateMin);
  const aiMax = asDayRate(ai.dayRateMax);
  const parsedMin = parsedRate.period === "DAY" ? parsedRate.min : null;
  const parsedMax = parsedRate.period === "DAY" ? parsedRate.max : null;

  return {
    title: cleanLine(ai.title, 200),
    company: cleanLine(ai.company, 200) || null,
    location,
    url: "",
    rateMin: aiMin ?? parsedMin ?? null,
    rateMax: aiMax ?? parsedMax ?? null,
    ir35: asIr35(ai.ir35) ?? detectIr35(text),
    remote: asRemote(ai.remote) ?? detectRemote(text, location),
    contractMonths: parseContractMonths(text),
  };
}

export type ManualJobValidation =
  | { ok: true; job: ManualJobFields }
  | { ok: false; error: string };

export type ManualJobFields = {
  advert: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: SalaryPeriod;
  contractType: ContractType;
  ir35: Ir35Status;
  remote: RemoteType;
};

function parseRateField(value: string): number | null | "invalid" {
  const trimmed = value.trim().replace(/^£/, "").replace(/,/g, "");
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 5000) return "invalid";
  return Math.round(n);
}

/**
 * Checks what the user confirmed. A job title and the advert text are the
 * minimum: without the advert there is nothing to score against, and without
 * a title the job is unidentifiable in a list.
 */
export function validateManualJob(input: ManualJobInput): ManualJobValidation {
  const advert = input.advert.trim();
  if (advert.length < MIN_ADVERT_LENGTH) {
    return {
      ok: false,
      error: `Paste the whole advert - that is only ${advert.length} characters, and the score is built from it.`,
    };
  }
  if (advert.length > MAX_ADVERT_LENGTH) {
    return { ok: false, error: "That is longer than any job advert. Paste just the advert." };
  }

  const title = cleanLine(input.title, 200);
  if (!title) return { ok: false, error: "Give the job a title." };

  const url = cleanLine(input.url, 2000);
  if (url && !/^https?:\/\/\S+$/i.test(url)) {
    return { ok: false, error: "The link should start with http:// or https://, or be left empty." };
  }

  const rateMin = parseRateField(input.rateMin);
  const rateMax = parseRateField(input.rateMax);
  if (rateMin === "invalid" || rateMax === "invalid") {
    return { ok: false, error: "Day rates should be whole numbers of pounds, or left empty." };
  }
  if (rateMin !== null && rateMax !== null && rateMin > rateMax) {
    return { ok: false, error: "The lowest day rate is higher than the highest." };
  }

  return {
    ok: true,
    job: {
      advert,
      title,
      company: cleanLine(input.company, 200) || null,
      location: cleanLine(input.location, 120) || null,
      url,
      salaryMin: rateMin,
      salaryMax: rateMax,
      salaryPeriod: rateMin === null && rateMax === null ? "UNKNOWN" : "DAY",
      // Manually added jobs are contracts: that is what this application is for,
      // and the user chose to add it.
      contractType: "CONTRACT",
      ir35: asIr35(input.ir35) ?? detectIr35(advert),
      remote: asRemote(input.remote) ?? detectRemote(advert, input.location || null),
    },
  };
}
