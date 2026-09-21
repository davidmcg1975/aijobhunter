import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { JobCard } from "@/components/job-card";
import { JobSearchPanel } from "@/components/job-search-panel";
import { sourceStatusFor } from "@/lib/jobsources/credentials";
import { keywordTerms, matchesKeywords, type KeywordMode } from "@/lib/jobsources/relevance";
import { effectiveDescription } from "@/lib/jobsources/description";
import { sourceDisplayName } from "@/lib/jobsources/registry";
import Link from "next/link";
import type { MatchBreakdown } from "@/lib/matching/types";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Jobs" };
export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  mode?: string;
  location?: string;
  minRate?: string;
  ir35?: string;
  remote?: string;
  days?: string;
  minScore?: string;
  sort?: string;
};

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  // Filtering happens against the local job database, not the provider, so it
  // is fast and does not consume the API allowance.
  const where: Prisma.JobWhereInput = {
    canonicalId: null,
    expiredAt: null,
  };
  // Every condition must hold. Collected here rather than assigned to
  // where.OR, which previously let a rate filter overwrite the keyword filter
  // and turn "keyword AND rate" into "keyword OR rate".
  const and: Prisma.JobWhereInput[] = [];

  const keywordMode: KeywordMode =
    params.mode === "any" || params.mode === "phrase" ? params.mode : "all";
  const terms = keywordTerms(params.q);
  const inText = (value: string): Prisma.JobWhereInput => ({
    OR: [
      { title: { contains: value, mode: "insensitive" } },
      { description: { contains: value, mode: "insensitive" } },
      { fullDescription: { contains: value, mode: "insensitive" } },
    ],
  });
  if (terms.length > 0) {
    // The same rule the live search applied when these jobs were stored.
    if (keywordMode === "phrase") and.push(inText(terms.join(" ")));
    else if (keywordMode === "any") and.push({ OR: terms.map(inText) });
    else and.push(...terms.map(inText));
  }
  if (params.location) {
    where.location = { contains: params.location, mode: "insensitive" };
  }
  if (params.minRate) {
    const rate = Number(params.minRate);
    if (Number.isFinite(rate)) {
      where.salaryPeriod = "DAY";
      and.push({ OR: [{ salaryMax: { gte: rate } }, { salaryMin: { gte: rate } }] });
    }
  }
  if (params.ir35 && params.ir35 !== "ANY") {
    where.ir35 = params.ir35 as "INSIDE" | "OUTSIDE";
  }
  if (params.remote && params.remote !== "ANY") {
    where.remote = params.remote as "REMOTE" | "HYBRID" | "ONSITE";
  }
  if (params.days) {
    const days = Number(params.days);
    if (Number.isFinite(days)) {
      where.postedAt = { gte: new Date(Date.now() - days * 86_400_000) };
    }
  }

  if (and.length > 0) where.AND = and;

  const minScore = params.minScore ? Number(params.minScore) : null;
  if (minScore !== null && Number.isFinite(minScore)) {
    where.matches = { some: { userId: user.id, score: { gte: minScore } } };
  }

  const jobs = await prisma.job.findMany({
    where,
    include: {
      analysis: { select: { inferredLengthMonths: true } },
      matches: { where: { userId: user.id }, take: 1 },
    },
    orderBy:
      params.sort === "rate"
        ? [{ salaryMax: "desc" }]
        : [{ postedAt: "desc" }, { retrievedAt: "desc" }],
    // With search words, the database narrows by substring and the exact rule
    // below does the rest, so fetch enough candidates for that to work on.
    take: terms.length > 0 ? 500 : 60,
  });

  // The database's "contains" matches inside words ("test" in "latest"); this
  // applies the same word rule the live search used, so the list and the
  // search agree about what matches.
  const matching =
    terms.length > 0
      ? jobs
          .filter((job) =>
            matchesKeywords(
              { title: job.title, description: effectiveDescription(job) },
              params.q,
              keywordMode,
            ),
          )
          .slice(0, 60)
      : jobs;

  // Sorting by match score has to happen after loading, because the score
  // lives on a per-user row rather than on the job itself.
  const rows = matching
    .map((job) => ({
      job,
      breakdown: (job.matches[0]?.breakdown ?? null) as MatchBreakdown | null,
    }))
    .sort((a, b) =>
      params.sort === "match"
        ? (b.breakdown?.score ?? -1) - (a.breakdown?.score ?? -1)
        : 0,
    );

  const sources = await sourceStatusFor(user.id);
  const configured = sources.filter((s) => s.configured);

  return (
    <Container>
      <PageHeader
        title="Jobs"
        description="Search live contract adverts, then filter the results stored here."
      />

      <JobSearchPanel
        defaults={params}
        sourcesConfigured={configured.length > 0}
        sourceNames={configured.map((s) => s.displayName)}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          margin: "1.6rem 0 0.8rem",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <h2 style={{ fontSize: "1.02rem", margin: 0 }}>
          {rows.length} {rows.length === 1 ? "job" : "jobs"}
          {params.q ? ` matching "${params.q}"` : ""}
        </h2>
        {params.q && (
          <Link href="/jobs" className="hint">
            Show all stored jobs
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={params.q ? "No stored jobs match that" : "No jobs stored yet"}
          description={
            configured.length === 0
              ? "No job source is set up yet. Add an Adzuna key under Settings → API keys to start searching."
              : params.q
                ? "Try fewer or broader words, or choose \"Any of these words\" and search again."
                : "Run a search above to pull live contract adverts into your job database."
          }
        />
      ) : (
        <div className="stack" style={{ gap: "0.8rem" }}>
          {rows.map(({ job, breakdown }) => (
            <JobCard
              key={job.id}
              job={job}
              breakdown={breakdown}
              sourceName={sourceDisplayName(job.source)}
            />
          ))}
        </div>
      )}
    </Container>
  );
}
