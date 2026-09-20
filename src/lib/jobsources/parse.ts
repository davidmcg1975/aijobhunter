import type { Ir35Status, RemoteType, SalaryPeriod } from "./types";

/**
 * Cheap deterministic heuristics run on every advert at ingest time.
 * They are not a substitute for the AI analysis (src/lib/ai/job-analysis.ts) -
 * they exist so search and filtering work before, or without, an AI call.
 */

const NEGATION = /\b(not|non|no longer|cannot be|can't be|won't be)\s+$/i;

function mentions(haystack: string, pattern: RegExp): boolean {
  return pattern.test(haystack);
}

/**
 * IR35 status. UK contract adverts state this in a small number of stock
 * phrasings; anything ambiguous stays UNKNOWN rather than guessing, because a
 * wrong IR35 label costs the contractor real money.
 */
export function detectIr35(text: string): Ir35Status {
  const t = text.toLowerCase();

  const outside =
    mentions(t, /\boutside\s+(of\s+)?ir\s?-?35\b/) ||
    mentions(t, /\bir\s?-?35\s*[:\-–]?\s*outside\b/) ||
    mentions(t, /\boutside\s+the\s+scope\s+of\s+ir\s?-?35\b/);

  const inside =
    mentions(t, /\binside\s+(of\s+)?ir\s?-?35\b/) ||
    mentions(t, /\bir\s?-?35\s*[:\-–]?\s*inside\b/) ||
    mentions(t, /\bwithin\s+(the\s+scope\s+of\s+)?ir\s?-?35\b/) ||
    mentions(t, /\bumbrella\s+only\b/);

  // Adverts that mention both (e.g. "inside or outside depending on...") are
  // genuinely ambiguous.
  if (outside && inside) return "UNKNOWN";
  if (outside) return "OUTSIDE";
  if (inside) return "INSIDE";
  return "UNKNOWN";
}

export function detectRemote(text: string, location?: string | null): RemoteType {
  const t = `${text} ${location ?? ""}`.toLowerCase();

  // "N days a week on-site" is the most common phrasing, and N decides it:
  // 1-4 days is hybrid, 5 is on-site. Note the optional separator, because
  // adverts write "on-site", "on site" and "onsite" interchangeably.
  const daysOnSite = t.match(
    /\b(\d)\s*(?:-\s*\d\s*)?days?\s+(?:a|per)\s+week\s+(?:in\s+the\s+office|(?:on|in)[- ]?site|in\s+office)\b/,
  );
  if (daysOnSite) {
    return Number(daysOnSite[1]) >= 5 ? "ONSITE" : "HYBRID";
  }

  if (mentions(t, /\b(hybrid|part[- ]remote|split between home and)\b/)) {
    return "HYBRID";
  }
  if (
    mentions(t, /\b(fully|100%|entirely)\s+remote\b/) ||
    mentions(t, /\bremote[- ](first|working|based)\b/) ||
    mentions(t, /\bwork\s+from\s+home\b/)
  ) {
    // "no remote working" / "not remote" must not read as remote.
    const idx = t.search(/\bremote\b/);
    const preceding = idx > 0 ? t.slice(Math.max(0, idx - 20), idx) : "";
    if (!NEGATION.test(preceding)) return "REMOTE";
  }
  if (mentions(t, /\b(on[- ]?site|onsite only|fully office based|5 days? (a|per) week (on|in) (the )?office)\b/)) {
    return "ONSITE";
  }
  return "UNKNOWN";
}

export type ParsedRate = {
  min: number | null;
  max: number | null;
  period: SalaryPeriod;
};

const RATE_PATTERN =
  /£\s?([\d,]+(?:\.\d+)?)\s*(?:k\b)?\s*(?:(?:-|–|to)\s*£?\s?([\d,]+(?:\.\d+)?)\s*(?:k\b)?)?\s*(?:per\s+|a\s+|\/\s*)?(day|daily|hour|hourly|annum|year|yearly|month)?/gi;

function toNumber(raw: string, hadK: boolean): number {
  const n = Number(raw.replace(/,/g, ""));
  return hadK ? n * 1000 : n;
}

/**
 * Pulls a rate out of advert text. UK contract adverts overwhelmingly quote a
 * day rate, so an unqualified figure in a plausible day-rate band is treated
 * as per-day; larger unqualified figures are treated as annual.
 */
export function parseRateFromText(text: string): ParsedRate {
  RATE_PATTERN.lastIndex = 0;
  let best: ParsedRate | null = null;

  for (const match of text.matchAll(RATE_PATTERN)) {
    const [full, rawMin, rawMax, unit] = match;
    const hadK = /k\b/i.test(full);
    const min = toNumber(rawMin!, hadK);
    const max = rawMax ? toNumber(rawMax, hadK) : null;

    let period: SalaryPeriod = "UNKNOWN";
    if (unit) {
      const u = unit.toLowerCase();
      if (u.startsWith("day") || u === "daily") period = "DAY";
      else if (u.startsWith("hour")) period = "HOUR";
      else if (u === "month") period = "MONTH";
      else period = "YEAR";
    } else if (min >= 80 && min <= 3000) {
      period = "DAY";
    } else if (min >= 15000) {
      period = "YEAR";
    }

    if (period === "UNKNOWN") continue;

    // Prefer an explicit day rate over anything else.
    if (!best || (period === "DAY" && best.period !== "DAY")) {
      best = { min, max, period };
    }
  }

  return best ?? { min: null, max: null, period: "UNKNOWN" };
}

/** Contract length in months, e.g. "6 month contract", "12 months initially". */
export function parseContractMonths(text: string): number | null {
  const monthMatch = text.match(/\b(\d{1,2})\s*[- ]?\s*month/i);
  if (monthMatch) {
    const months = Number(monthMatch[1]);
    if (months >= 1 && months <= 60) return months;
  }
  const weekMatch = text.match(/\b(\d{1,3})\s*[- ]?\s*week/i);
  if (weekMatch) {
    const weeks = Number(weekMatch[1]);
    if (weeks >= 1 && weeks <= 260) return Math.max(1, Math.round(weeks / 4.33));
  }
  const yearMatch = text.match(/\b(\d)\s*[- ]?\s*year\s+contract/i);
  if (yearMatch) return Number(yearMatch[1]) * 12;
  return null;
}

/**
 * Adzuna (and most aggregators) annualise everything. When a contract advert
 * reports a "salary" that is really a day rate, convert on the way in.
 * 220 working days is the conventional UK contracting year.
 */
export const WORKING_DAYS_PER_YEAR = 220;

export function annualToDayRate(annual: number): number {
  return Math.round(annual / WORKING_DAYS_PER_YEAR);
}

/**
 * Aggregators document their salary fields as annualised, but do not deliver
 * that consistently. Observed live on Adzuna, both with contract_type=contract:
 *
 *   salary_min: 130000   -> genuinely annualised (£591/day)
 *   salary_min: 300      -> already a day rate, passed through from the advert
 *
 * Dividing both by 220 turns the second into £1/day. Magnitude is the only
 * signal available, so the bands below are deliberately conservative and
 * anything ambiguous returns null rather than a confident wrong number.
 */
export function providerSalaryToDayRate(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;

  // Plausible UK IT hourly rate.
  if (value >= 15 && value < 100) return Math.round(value * 7.5);

  // Plausible UK IT day rate.
  if (value >= 100 && value <= 2500) return Math.round(value);

  // Plausible annual salary.
  if (value >= 15_000) return annualToDayRate(value);

  // 2500-15000: too high for a day rate, too low for a UK IT annual salary.
  return null;
}

export function normaliseToDayRate(
  value: number | null,
  period: SalaryPeriod,
): number | null {
  if (value === null) return null;
  switch (period) {
    case "DAY":
      return Math.round(value);
    case "HOUR":
      return Math.round(value * 7.5);
    case "MONTH":
      return Math.round((value * 12) / WORKING_DAYS_PER_YEAR);
    case "YEAR":
      return annualToDayRate(value);
    default:
      return null;
  }
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Reed returns dates as "DD/MM/YYYY". Parsed explicitly because Date() reads
 * that as US month-first: "04/09/2026" would become 9 April, not 4 September.
 */
export function parseReedDate(value: string): Date | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}
