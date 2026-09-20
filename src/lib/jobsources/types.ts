/**
 * The common internal job format. Every provider adapter converts its own
 * payload into this shape; nothing outside src/lib/jobsources may know which
 * provider a job came from beyond the `source` string.
 */
export type NormalisedJob = {
  source: string;
  sourceJobId: string;
  title: string;
  company: string | null;
  description: string;
  /** True when the provider returned only an extract, not the full advert. */
  descriptionTruncated: boolean;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: SalaryPeriod;
  salaryIsPredicted: boolean;
  contractType: ContractType;
  contractTime: string | null;
  remote: RemoteType;
  ir35: Ir35Status;
  url: string;
  postedAt: Date | null;
};

export type SalaryPeriod = "DAY" | "HOUR" | "MONTH" | "YEAR" | "UNKNOWN";
export type ContractType = "CONTRACT" | "PERMANENT" | "UNKNOWN";
export type RemoteType = "REMOTE" | "HYBRID" | "ONSITE" | "UNKNOWN";
export type Ir35Status = "INSIDE" | "OUTSIDE" | "UNKNOWN";

/** Provider-agnostic search criteria. */
export type JobSearchCriteria = {
  keywords?: string;
  /**
   * How multi-word keywords are combined. Providers default to ALL (an AND),
   * which on Adzuna makes "senior test analyst QA" return nothing at all.
   */
  keywordMode?: "all" | "any" | "phrase";
  location?: string;
  radiusMiles?: number;
  minDayRate?: number;
  contractType?: ContractType;
  ir35?: Ir35Status | "ANY";
  remote?: RemoteType | "ANY";
  postedWithinDays?: number;
  page?: number;
  perPage?: number;
  sortBy?: "relevance" | "date" | "salary";
};

export type JobSourceResult = {
  jobs: NormalisedJob[];
  /** Total available upstream, when the provider reports it. */
  totalAvailable: number | null;
};

/**
 * Implemented once per provider. Adding JobServe, Reed or CV-Library means
 * adding a class here and registering it - no changes anywhere else.
 */
export interface JobSource {
  /** Stable identifier stored on every Job row, e.g. "adzuna". */
  readonly id: string;
  readonly displayName: string;

  /** False when the provider's credentials are not configured. */
  isConfigured(): boolean;

  search(criteria: JobSearchCriteria): Promise<JobSourceResult>;
}

export class JobSourceError extends Error {
  constructor(
    public readonly source: string,
    public readonly code: string,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "JobSourceError";
  }
}
