import "server-only";
import { prisma } from "@/lib/db";
import {
  JobSourceError,
  type JobSearchCriteria,
  type JobSource,
  type JobSourceResult,
  type NormalisedJob,
} from "./types";
import {
  detectIr35,
  detectRemote,
  parseRateFromText,
  parseReedDate,
  providerSalaryToDayRate,
  stripHtml,
} from "./parse";

const BASE_URL = "https://www.reed.co.uk/api/1.0";

/** Fields we consume from Reed's search response. */
type ReedResult = {
  jobId: number;
  employerName?: string;
  jobTitle?: string;
  jobDescription?: string;
  locationName?: string;
  minimumSalary?: number | null;
  maximumSalary?: number | null;
  currency?: string;
  date?: string;
  expirationDate?: string;
  jobUrl?: string;
};

type ReedResponse = {
  results?: ReedResult[];
  totalResults?: number;
};

/**
 * Reed adapter.
 *
 * Reed publishes a documented jobseeker API (reed.co.uk/developers) with a
 * free key, which is why this exists and a JobServe adapter does not - see
 * docs/job-sources.md.
 *
 * Authentication is HTTP Basic with the API key as the username and an empty
 * password. The key is read from the server environment only and never
 * reaches the browser.
 */
export class ReedSource implements JobSource {
  readonly id = "reed";
  readonly displayName = "Reed";

  isConfigured(): boolean {
    return Boolean(process.env.REED_API_KEY);
  }

  async search(criteria: JobSearchCriteria): Promise<JobSourceResult> {
    const apiKey = process.env.REED_API_KEY;
    if (!apiKey) {
      throw new JobSourceError(
        this.id,
        "NOT_CONFIGURED",
        "Reed credentials are not configured",
      );
    }

    const params = new URLSearchParams({
      resultsToTake: String(Math.min(criteria.perPage ?? 25, 100)),
      resultsToSkip: String(((criteria.page ?? 1) - 1) * (criteria.perPage ?? 25)),
    });

    // Reed has no OR mode, so "any of these words" degrades to the same
    // keyword string rather than silently returning nothing.
    if (criteria.keywords) params.set("keywords", criteria.keywords);
    if (criteria.location) params.set("locationName", criteria.location);
    if (criteria.radiusMiles) {
      params.set("distanceFromLocation", String(criteria.radiusMiles));
    }
    if (criteria.contractType === "CONTRACT") params.set("contract", "true");
    if (criteria.contractType === "PERMANENT") params.set("permanent", "true");

    // Reed filters on annual salary, so a day rate is scaled up the same way
    // the Adzuna adapter does it.
    if (criteria.minDayRate) {
      params.set("minimumSalary", String(criteria.minDayRate * 220));
    }

    const url = `${BASE_URL}/search?${params}`;
    // Basic auth: key as username, empty password.
    const authorisation = Buffer.from(`${apiKey}:`).toString("base64");

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Basic ${authorisation}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
    } catch (cause) {
      await this.logFetch(criteria, 0, false, "NETWORK", String(cause));
      throw new JobSourceError(this.id, "NETWORK", "Could not reach Reed", true);
    }

    if (!response.ok) {
      const code =
        response.status === 429 ? "RATE_LIMITED" : `HTTP_${response.status}`;
      await this.logFetch(criteria, 0, false, code, `status ${response.status}`);
      throw new JobSourceError(
        this.id,
        code,
        response.status === 401
          ? "Reed rejected the API key"
          : response.status === 429
            ? "Reed rate limit reached - try again shortly"
            : `Reed returned ${response.status}`,
        response.status === 429 || response.status >= 500,
      );
    }

    const payload = (await response.json()) as ReedResponse;
    const jobs = (payload.results ?? [])
      .filter((r) => r.jobId && r.jobTitle)
      .map((r) => this.normalise(r));

    await this.logFetch(criteria, jobs.length, true);

    return { jobs, totalAvailable: payload.totalResults ?? null };
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
          // Never the URL - it would not contain the key here, but the header
          // discipline is the same across every adapter.
          errorDetail: errorDetail?.slice(0, 1000),
        },
      })
      .catch(() => {});
  }

  private normalise(raw: ReedResult): NormalisedJob {
    const rawDescription = raw.jobDescription ?? "";
    const description = stripHtml(rawDescription);
    const title = raw.jobTitle?.trim() ?? "Untitled role";
    const haystack = `${title}\n${description}`;

    // Reed's search endpoint returns a summary, not the full advert - the same
    // limitation Adzuna has, and the same remedy (paste the full text).
    const descriptionTruncated =
      rawDescription.trim().endsWith("...") || description.length <= 550;

    const fromText = parseRateFromText(haystack);
    let salaryMin = fromText.min;
    let salaryMax = fromText.max;
    let salaryPeriod = fromText.period;

    if (salaryMin === null && raw.minimumSalary) {
      salaryMin = providerSalaryToDayRate(raw.minimumSalary);
      salaryMax = raw.maximumSalary
        ? providerSalaryToDayRate(raw.maximumSalary)
        : null;
      salaryPeriod = salaryMin === null ? "UNKNOWN" : "DAY";
    }

    return {
      source: this.id,
      sourceJobId: String(raw.jobId),
      title,
      company: raw.employerName?.trim() ?? null,
      description,
      descriptionTruncated,
      location: raw.locationName?.trim() ?? null,
      latitude: null,
      longitude: null,
      salaryMin,
      salaryMax,
      salaryPeriod,
      salaryIsPredicted: false,
      // The search endpoint does not return contract type; the caller filters
      // with the `contract` parameter instead, so this stays honest.
      contractType: "UNKNOWN",
      contractTime: null,
      remote: detectRemote(haystack, raw.locationName),
      ir35: detectIr35(haystack),
      url: raw.jobUrl ?? `https://www.reed.co.uk/jobs/${raw.jobId}`,
      postedAt: raw.date ? parseReedDate(raw.date) : null,
    };
  }
}

