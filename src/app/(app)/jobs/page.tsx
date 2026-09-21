import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { JobCard } from "@/components/job-card";
import { JobSearchPanel } from "@/components/job-search-panel";
import { sourceStatusFor } from "@/lib/jobsources/credentials";
import type { MatchBreakdown } from "@/lib/matching/types";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Jobs" };
export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
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

  if (params.q) {
    where.OR = [
      { title: { contains: params.q, mode: "insensitive" } },
      { description: { contains: params.q, mode: "insensitive" } },
    ];
  }
  if (params.location) {
    where.location = { contains: params.location, mode: "insensitive" };
  }
  if (params.minRate) {
    const rate = Number(params.minRate);
    if (Number.isFinite(rate)) {
      where.salaryPeriod = "DAY";
      where.OR = [
        ...(Array.isArray(where.OR) ? where.OR : []),
        { salaryMax: { gte: rate } },
        { salaryMin: { gte: rate } },
      ];
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
    take: 60,
  });

  // Sorting by match score has to happen after loading, because the score
  // lives on a per-user row rather than on the job itself.
  const rows = jobs
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
        </h2>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No jobs stored yet"
          description={
            configured.length > 0
              ? "Run a search above to pull live contract adverts into your job database."
              : "No job source is configured. Add your Adzuna credentials to the server environment to start searching."
          }
        />
      ) : (
        <div className="stack" style={{ gap: "0.8rem" }}>
          {rows.map(({ job, breakdown }) => (
            <JobCard key={job.id} job={job} breakdown={breakdown} />
          ))}
        </div>
      )}
    </Container>
  );
}
