import "server-only";
import { prisma } from "@/lib/db";
import { availableSources, type ResolvedSource } from "./credentials";
import { fingerprint, findDuplicate } from "./dedupe";
import { matchesKeywords } from "./relevance";
import type { JobSearchCriteria, NormalisedJob } from "./types";
import { JobSourceError } from "./types";

export type IngestSummary = {
  source: string;
  received: number;
  created: number;
  updated: number;
  duplicates: number;
  /** Returned by the provider but not matching the search words - not stored. */
  skipped: number;
  error?: string;
};

/**
 * Fetch -> normalise -> deduplicate -> store.
 *
 * Jobs are shared reference data: they are not owned by the user who happened
 * to trigger the fetch, and carry no userId.
 */
export async function ingestFromSource(
  { source, credentials }: ResolvedSource,
  criteria: JobSearchCriteria,
): Promise<IngestSummary> {
  const sourceId = source.id;

  let jobs: NormalisedJob[];
  try {
    ({ jobs } = await source.search(criteria, credentials));
  } catch (error) {
    return {
      source: sourceId,
      received: 0,
      created: 0,
      updated: 0,
      duplicates: 0,
      skipped: 0,
      error:
        error instanceof JobSourceError
          ? error.message
          : "Unexpected error contacting job source",
    };
  }

  // Providers match loosely; keep only what the user actually asked for.
  const relevant = jobs.filter((job) =>
    matchesKeywords(job, criteria.keywords, criteria.keywordMode),
  );

  let created = 0;
  let updated = 0;
  let duplicates = 0;

  for (const job of relevant) {
    const result = await storeJob(job);
    if (result === "created") created += 1;
    else if (result === "updated") updated += 1;
    else duplicates += 1;
  }

  return {
    source: sourceId,
    received: jobs.length,
    created,
    updated,
    duplicates,
    skipped: jobs.length - relevant.length,
  };
}

/**
 * `userId` selects whose keys are used: that user's own where saved, the
 * installation's otherwise. Omit it for background runs, which must only ever
 * spend the installation's allowance.
 */
export async function ingestFromAllSources(
  criteria: JobSearchCriteria,
  userId?: string | null,
): Promise<IngestSummary[]> {
  const sources = await availableSources(userId);
  const summaries: IngestSummary[] = [];
  // Sequential on purpose: providers have per-minute allowances and running
  // them in parallel is the quickest way to get rate limited.
  for (const resolved of sources) {
    summaries.push(await ingestFromSource(resolved, criteria));
  }
  return summaries;
}

type StoreOutcome = "created" | "updated" | "duplicate";

async function storeJob(job: NormalisedJob): Promise<StoreOutcome> {
  const fp = fingerprint(job);

  // Same advert from the same provider: refresh it in place.
  const existing = await prisma.job.findUnique({
    where: {
      source_sourceJobId: {
        source: job.source,
        sourceJobId: job.sourceJobId,
      },
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.job.update({
      where: { id: existing.id },
      data: {
        title: job.title,
        company: job.company,
        description: job.description,
      descriptionTruncated: job.descriptionTruncated,
        location: job.location,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryPeriod: job.salaryPeriod,
        salaryIsPredicted: job.salaryIsPredicted,
        contractType: job.contractType,
        contractTime: job.contractTime,
        remote: job.remote,
        ir35: job.ir35,
        url: job.url,
        postedAt: job.postedAt,
        retrievedAt: new Date(),
        fingerprint: fp,
      },
    });
    return "updated";
  }

  // Cross-posting / cross-source duplicate: keep the record but point it at
  // the one we display, so the original source URL is never lost.
  const candidates = await prisma.job.findMany({
    where: { fingerprint: fp, canonicalId: null },
    select: {
      id: true,
      source: true,
      sourceJobId: true,
      description: true,
      url: true,
    },
    take: 20,
  });

  const duplicateOf = findDuplicate(job, candidates);

  await prisma.job.create({
    data: {
      source: job.source,
      sourceJobId: job.sourceJobId,
      title: job.title,
      company: job.company,
      description: job.description,
      descriptionTruncated: job.descriptionTruncated,
      location: job.location,
      latitude: job.latitude,
      longitude: job.longitude,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryPeriod: job.salaryPeriod,
      salaryIsPredicted: job.salaryIsPredicted,
      contractType: job.contractType,
      contractTime: job.contractTime,
      remote: job.remote,
      ir35: job.ir35,
      url: job.url,
      postedAt: job.postedAt,
      fingerprint: fp,
      canonicalId: duplicateOf,
    },
  });

  return duplicateOf ? "duplicate" : "created";
}
