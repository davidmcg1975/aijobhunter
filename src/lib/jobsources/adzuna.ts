import "server-only";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
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
  providerSalaryToDayRate,
  parseRateFromText,
  stripHtml,
} from "./parse";

const BASE_URL = "https://api.adzuna.com/v1/api/jobs";

/** Shape of the fields we consume from Adzuna's search response. */
type AdzunaResult = {
  id: string;
  title?: string;
  description?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  latitude?: number;
  longitude?: number;
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string | number;
  contract_type?: string;
  contract_time?: string;
  redirect_url?: string;
  created?: string;
};

type AdzunaResponse = {
  results?: AdzunaResult[];
  count?: number;
};

/**
 * Adzuna adapter.
 *
 * Credentials are read from the server environment only and are never
 * returned to callers - see docs/security.md and docs/adzuna.md.
 */
export class AdzunaSource implements JobSource {
  readonly id = "adzuna";
  readonly displayName = "Adzuna";

  isConfigured(): boolean {
    return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
  }

  async search(criteria: JobSearchCriteria): Promise<JobSourceResult> {
    const config = env();
    if (!this.isConfigured()) {
      throw new JobSourceError(
        this.id,
        "NOT_CONFIGURED",
        "Adzuna credentials are not configured",
      );
    }

    await this.assertWithinDailyAllowance(config.ADZUNA_DAILY_CALL_LIMIT);

    const page = Math.max(1, criteria.page ?? 1);
    const params = new URLSearchParams({
      app_id: config.ADZUNA_APP_ID!,
      app_key: config.ADZUNA_APP_KEY!,
      results_per_page: String(Math.min(criteria.perPage ?? 20, 50)),
      "content-type": "application/json",
    });

    if (criteria.keywords) {
      // Adzuna: "what" ANDs the terms, "what_or" ORs them, "what_phrase" is an
      // exact phrase. Verified against the live API - a multi-word "what"
      // combined with the contract filter routinely returns zero results.
      const field =
        criteria.keywordMode === "any"
          ? "what_or"
          : criteria.keywordMode === "phrase"
            ? "what_phrase"
            : "what";
      params.set(field, criteria.keywords);
    }
    if (criteria.location) params.set("where", criteria.location);
    if (criteria.radiusMiles) params.set("distance", String(criteria.radiusMiles));
    if (criteria.postedWithinDays) {
      params.set("max_days_old", String(criteria.postedWithinDays));
    }
    if (criteria.contractType === "CONTRACT") params.set("contract", "1");
    if (criteria.contractType === "PERMANENT") params.set("permanent", "1");
    if (criteria.sortBy === "date") params.set("sort_by", "date");
    if (criteria.sortBy === "salary") params.set("sort_by", "salary");

    // Adzuna filters on annualised salary, so a day rate must be scaled up.
    if (criteria.minDayRate) {
      params.set("salary_min", String(criteria.minDayRate * 220));
    }

    const url = `${BASE_URL}/${config.ADZUNA_COUNTRY}/search/${page}?${params}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
    } catch (cause) {
      await this.logFetch(criteria, 0, 0, false, "NETWORK", String(cause));
      throw new JobSourceError(
        this.id,
        "NETWORK",
        "Could not reach Adzuna",
        true,
      );
    }

    if (!response.ok) {
      const code = response.status === 429 ? "RATE_LIMITED" : `HTTP_${response.status}`;
      // Body may contain the key in an echoed URL, so it is not logged verbatim.
      await this.logFetch(criteria, 0, 0, false, code, `status ${response.status}`);
      throw new JobSourceError(
        this.id,
        code,
        response.status === 429
          ? "Adzuna rate limit reached - try again shortly"
          : `Adzuna returned ${response.status}`,
        response.status === 429 || response.status >= 500,
      );
    }

    const payload = (await response.json()) as AdzunaResponse;
    const jobs = (payload.results ?? [])
      .filter((r) => r.id && r.title)
      .map((r) => this.normalise(r));

    await this.logFetch(criteria, jobs.length, jobs.length, true);

    return { jobs, totalAvailable: payload.count ?? null };
  }

  /**
   * Adzuna's free allowance is 25/min, 250/day, 1000/week, 2500/month. We cap
   * ourselves below the daily figure so a runaway loop cannot exhaust it.
   */
  private async assertWithinDailyAllowance(limit: number): Promise<void> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const used = await prisma.sourceFetchLog.count({
      where: { source: this.id, createdAt: { gte: since } },
    });
    if (used >= limit) {
      throw new JobSourceError(
        this.id,
        "DAILY_LIMIT",
        `Daily Adzuna allowance of ${limit} calls is used up - it resets on a rolling 24h window`,
      );
    }
  }

  private async logFetch(
    criteria: JobSearchCriteria,
    received: number,
    created: number,
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
          created,
          succeeded,
          errorCode,
          errorDetail: errorDetail?.slice(0, 1000),
        },
      })
      .catch(() => {});
  }

  private normalise(raw: AdzunaResult): NormalisedJob {
    const rawDescription = raw.description ?? "";
    const description = stripHtml(rawDescription);
    const title = raw.title?.trim() ?? "Untitled role";
    const haystack = `${title}\n${description}`;

    // Adzuna's search endpoint returns a 500-character extract, not the advert.
    // There is no full-text field on the response, so this is a hard limit of
    // the API rather than something we can request. Flagged so the AI prompt
    // and the UI can both say so honestly - see docs/adzuna.md.
    const descriptionTruncated =
      rawDescription.length >= 490 || /[…]\s*$|\.\.\.\s*$/.test(rawDescription);

    const isContract = (raw.contract_type ?? "").toLowerCase() === "contract";
    const predicted =
      raw.salary_is_predicted === "1" || raw.salary_is_predicted === 1;

    // Prefer a rate stated in the advert text; fall back to Adzuna's
    // annualised figure, which for contracts is a day rate multiplied out.
    const fromText = parseRateFromText(haystack);
    let salaryMin = fromText.min;
    let salaryMax = fromText.max;
    let salaryPeriod = fromText.period;
    let isPredicted = false;

    if (salaryMin === null && raw.salary_min) {
      if (isContract) {
        // Adzuna's contract salaries are sometimes annualised and sometimes
        // already day rates - see providerSalaryToDayRate.
        salaryMin = providerSalaryToDayRate(raw.salary_min);
        salaryMax = raw.salary_max
          ? providerSalaryToDayRate(raw.salary_max)
          : null;
        salaryPeriod = salaryMin === null ? "UNKNOWN" : "DAY";
      } else {
        salaryMin = Math.round(raw.salary_min);
        salaryMax = raw.salary_max ? Math.round(raw.salary_max) : null;
        salaryPeriod = "YEAR";
      }
      isPredicted = predicted;
    }

    return {
      source: this.id,
      sourceJobId: String(raw.id),
      title,
      company: raw.company?.display_name?.trim() ?? null,
      description,
      descriptionTruncated,
      location: raw.location?.display_name?.trim() ?? null,
      latitude: raw.latitude ?? null,
      longitude: raw.longitude ?? null,
      salaryMin,
      salaryMax,
      salaryPeriod,
      salaryIsPredicted: isPredicted,
      contractType: isContract
        ? "CONTRACT"
        : (raw.contract_type ?? "").toLowerCase() === "permanent"
          ? "PERMANENT"
          : "UNKNOWN",
      contractTime: raw.contract_time ?? null,
      remote: detectRemote(haystack, raw.location?.display_name),
      ir35: detectIr35(haystack),
      url: raw.redirect_url ?? "",
      postedAt: raw.created ? new Date(raw.created) : null,
    };
  }
}
