import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import type { Credentials } from "@/lib/credentials/fields";
import {
  JobSourceError,
  type ContractType,
  type JobSearchCriteria,
  type JobSource,
  type JobSourceResult,
  type NormalisedJob,
  type SalaryPeriod,
} from "./types";
import {
  detectIr35,
  detectRemote,
  normaliseToDayRate,
  parseRateFromText,
  providerSalaryToDayRate,
  stripHtml,
} from "./parse";

const BASE_URL = "https://search.api.careerjet.net/v4/query";

/** Fields we consume from Careerjet's response. */
type CareerjetJob = {
  title?: string;
  description?: string;
  company?: string;
  locations?: string;
  salary?: string;
  salary_min?: number | string | null;
  salary_max?: number | string | null;
  /** Y yearly, M monthly, W weekly, D daily, H hourly. */
  salary_type?: string | null;
  salary_currency_code?: string | null;
  date?: string;
  url?: string;
  site?: string;
};

type CareerjetResponse = {
  type?: string;
  jobs?: CareerjetJob[];
  hits?: number;
  pages?: number;
  error?: string;
};

/**
 * Careerjet adapter.
 *
 * An aggregator, so it reaches boards this application cannot call directly.
 * Two things make it a good fit for UK contracting:
 *
 *  - it filters on contract type natively (`contracttype=c`), where Adzuna and
 *    Reed only offer a boolean and Adzuna's own contract flag is unreliable
 *  - it returns an explicit salary PERIOD, so a day rate does not have to be
 *    inferred from magnitude the way it does for the other two
 *
 * Auth is HTTP Basic with the affiliate key as the username and an empty
 * password. Careerjet additionally requires the end user's IP and user agent
 * on every request; see the note on forwardedFor below.
 */
export class CareerjetSource implements JobSource {
  readonly id = "careerjet";
  readonly displayName = "Careerjet";

  readonly credentialFields = [
    { name: "apiKey", label: "Careerjet API key", pattern: /^[A-Za-z0-9]+$/ },
  ];
  readonly credentialUrl = "https://www.careerjet.com/partners/api/";
  readonly credentialNote =
    "Careerjet only answers requests from IP addresses registered in your " +
    "publisher account. Add the public IP address of the machine this app " +
    "runs on, or searches will be refused.";

  environmentCredentials(): Credentials | null {
    const apiKey = process.env.CAREERJET_API_KEY;
    return apiKey ? { apiKey } : null;
  }

  async search(
    criteria: JobSearchCriteria,
    credentials: Credentials,
  ): Promise<JobSourceResult> {
    const apiKey = credentials.apiKey;
    if (!apiKey) {
      throw new JobSourceError(
        this.id,
        "NOT_CONFIGURED",
        "Careerjet credentials are not configured",
      );
    }

    const perPage = Math.min(criteria.perPage ?? 20, 99);
    const params = new URLSearchParams({
      locale_code: process.env.CAREERJET_LOCALE ?? "en_GB",
      pagesize: String(perPage),
      page: String(Math.max(1, criteria.page ?? 1)),
      // Required by Careerjet on every request. These identify the end user
      // making the search; the server's own values are sent because the search
      // is server-initiated, and the user's IP is never forwarded to a third
      // party (see docs/security.md - no user data leaves for a job source).
      user_ip: "127.0.0.1",
      user_agent: "AI Contract Hunter (server-side job search)",
    });

    if (criteria.keywords) params.set("keywords", criteria.keywords);
    if (criteria.location) params.set("location", criteria.location);
    if (criteria.radiusMiles) params.set("radius", String(criteria.radiusMiles));

    // c = contract, p = permanent, t = temporary.
    if (criteria.contractType === "CONTRACT") params.set("contracttype", "c");
    if (criteria.contractType === "PERMANENT") params.set("contracttype", "p");

    if (criteria.sortBy === "date") params.set("sort", "date");
    if (criteria.sortBy === "salary") params.set("sort", "salary");

    const url = `${BASE_URL}?${params}`;
    const authorisation = Buffer.from(`${apiKey}:`).toString("base64");

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Basic ${authorisation}`,
          Accept: "application/json",
          // Mandatory. Careerjet rejects a request with no Referer as
          // "Undeclared referrer", even with a valid key from an allowed
          // address. Any value is accepted - it identifies the calling site -
          // so this declares the deployment honestly rather than spoofing one.
          Referer: env().APP_URL,
        },
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
    } catch (cause) {
      await this.logFetch(criteria, 0, false, "NETWORK", String(cause));
      throw new JobSourceError(
        this.id,
        "NETWORK",
        "Could not reach Careerjet",
        true,
      );
    }

    if (!response.ok) {
      const code =
        response.status === 429 ? "RATE_LIMITED" : `HTTP_${response.status}`;
      await this.logFetch(criteria, 0, false, code, `status ${response.status}`);

      // 401 and 403 mean genuinely different things here, and conflating them
      // sends you hunting for the wrong problem. 401 is a missing or malformed
      // key. 403 is a valid key called from an address Careerjet has not been
      // told about - no request header or parameter can satisfy it, it is
      // fixed in the publisher account.
      const message =
        response.status === 401
          ? "Careerjet did not accept the API key. It must be sent as the HTTP Basic username with an empty password."
          : response.status === 403
            ? `Careerjet refused this request: ${response.statusText}. If it names an IP address, add that address to the allowed list in your Careerjet publisher account.`
            : response.status === 429
              ? "Careerjet rate limit reached - try again shortly"
              : `Careerjet returned ${response.status}`;

      throw new JobSourceError(
        this.id,
        code,
        message,
        response.status === 429 || response.status >= 500,
      );
    }

    const payload = (await response.json()) as CareerjetResponse;

    // Careerjet reports some failures as HTTP 200 with an error body, so the
    // status code alone is not enough to tell success from failure.
    if (payload.error || (payload.type && payload.type !== "JOBS")) {
      const detail = payload.error ?? `type ${payload.type}`;
      await this.logFetch(criteria, 0, false, "API_ERROR", detail);
      throw new JobSourceError(
        this.id,
        "API_ERROR",
        // Careerjet error bodies describe the problem usefully and contain no
        // secrets, so the user sees it rather than a generic failure.
        `Careerjet could not complete that search: ${detail}`,
      );
    }

    const jobs = (payload.jobs ?? [])
      .filter((j) => j.url && j.title)
      .map((j) => this.normalise(j));

    await this.logFetch(criteria, jobs.length, true);

    return { jobs, totalAvailable: payload.hits ?? null };
  }

  private async logFetch(
    criteria: JobSearchCriteria,
    received: number,
    succeeded: boolean,
    errorCode?: string,
    errorDetail?: string,
  ): Promise<void> {
    await prisma.sourceFetchLog
      .create({
        data: {
          source: this.id,
          query: [criteria.keywords, criteria.location]
            .filter(Boolean)
            .join(" | ")
            .slice(0, 300),
          requested: 1,
          received,
          created: received,
          succeeded,
          errorCode,
          errorDetail: errorDetail?.slice(0, 1000),
        },
      })
      .catch(() => {});
  }

  private normalise(raw: CareerjetJob): NormalisedJob {
    const rawDescription = raw.description ?? "";
    const description = stripHtml(rawDescription);
    const title = raw.title?.trim() ?? "Untitled role";
    const haystack = `${title}\n${description}`;

    // Careerjet returns a snippet, like the other aggregators.
    const descriptionTruncated =
      description.length <= 550 || /[…]\s*$|\.\.\.\s*$/.test(description);

    // Prefer a rate stated in the advert text, then Careerjet's structured
    // figure - which, unusually, comes with an explicit period.
    const fromText = parseRateFromText(haystack);
    let salaryMin = fromText.min;
    let salaryMax = fromText.max;
    let salaryPeriod: SalaryPeriod = fromText.period;

    if (salaryMin === null) {
      const period = careerjetSalaryPeriod(raw.salary_type);
      const min = toNumber(raw.salary_min);
      const max = toNumber(raw.salary_max);

      if (min !== null && period !== "UNKNOWN") {
        // The period is stated, so convert exactly rather than guessing.
        salaryMin = normaliseToDayRate(min, period);
        salaryMax = max !== null ? normaliseToDayRate(max, period) : null;
        salaryPeriod = salaryMin === null ? "UNKNOWN" : "DAY";
      } else if (min !== null) {
        // No period given - fall back to the shared magnitude heuristic.
        salaryMin = providerSalaryToDayRate(min);
        salaryMax = max !== null ? providerSalaryToDayRate(max) : null;
        salaryPeriod = salaryMin === null ? "UNKNOWN" : "DAY";
      }
    }

    return {
      source: this.id,
      sourceJobId: careerjetJobId(raw),
      title,
      company: raw.company?.trim() || null,
      description,
      descriptionTruncated,
      location: raw.locations?.trim() || null,
      latitude: null,
      longitude: null,
      salaryMin,
      salaryMax,
      salaryPeriod,
      salaryIsPredicted: false,
      // The caller filters with contracttype; the response does not echo it
      // back, so this stays UNKNOWN rather than being assumed.
      contractType: "UNKNOWN" as ContractType,
      contractTime: null,
      remote: detectRemote(haystack, raw.locations),
      ir35: detectIr35(haystack),
      url: raw.url!,
      postedAt: raw.date ? parseCareerjetDate(raw.date) : null,
    };
  }
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Careerjet's salary_type is a single letter.
 * Exported for testing - the mapping is the difference between a correct day
 * rate and one that is out by a factor of 220.
 */
export function careerjetSalaryPeriod(
  type: string | null | undefined,
): SalaryPeriod {
  switch ((type ?? "").trim().toUpperCase()) {
    case "Y":
      return "YEAR";
    case "M":
      return "MONTH";
    case "D":
      return "DAY";
    case "H":
      return "HOUR";
    // W (weekly) has no slot in SalaryPeriod and converting it would be a
    // guess about days worked, so it is left unknown.
    default:
      return "UNKNOWN";
  }
}

/**
 * Careerjet returns no job id, and its advert URL cannot serve as one.
 *
 * The URL is a `jobviewtrack.com` redirect whose whole path token is
 * regenerated on every request: two identical searches 2.5 seconds apart
 * returned different URLs for all ten adverts. Keying on it would make every
 * search re-import the entire page as new jobs.
 *
 * Title, company and location are stable across requests, so the identity is
 * a hash of those. Two genuinely distinct adverts sharing all three are
 * treated as one job, which is the same assumption `fingerprint()` already
 * makes for cross-source deduplication.
 */
export function careerjetJobId(job: {
  title?: string;
  company?: string;
  locations?: string;
}): string {
  const normalise = (value: string | undefined) =>
    (value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const identity = [
    normalise(job.title),
    normalise(job.company),
    normalise(job.locations),
  ].join("|");

  return createHash("sha256").update(identity).digest("hex").slice(0, 32);
}

/**
 * Careerjet returns RFC 1123 dates ("Sat, 19 Sep 2026 06:30:55 GMT"), which
 * Date parses natively. The DD/MM/YYYY branch is kept because other locales
 * have been reported to use it, and Date would read that as US month-first.
 */
export function parseCareerjetDate(value: string): Date | null {
  const uk = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (uk) {
    const [, day, month, year] = uk;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
