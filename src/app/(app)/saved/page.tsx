import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { JobCard } from "@/components/job-card";
import { jobOriginLabel } from "@/lib/jobsources/registry";
import type { MatchBreakdown } from "@/lib/matching/types";

export const metadata = { title: "Saved jobs" };
export const dynamic = "force-dynamic";

export default async function SavedJobsPage() {
  const user = await requireUser();

  const saved = await prisma.savedJob.findMany({
    where: { userId: user.id },
    include: {
      job: {
        include: {
          analysis: { select: { inferredLengthMonths: true } },
          matches: { where: { userId: user.id }, take: 1 },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <Container>
      <PageHeader
        title="Saved jobs"
        description="Contracts you have set aside to look at properly."
      />

      {saved.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          description="Save a job from its detail page and it will appear here."
          action={
            <Link href="/jobs" className="btn btn-primary">
              Find jobs
            </Link>
          }
        />
      ) : (
        <div className="stack" style={{ gap: "0.8rem" }}>
          {saved.map((row) => (
            <JobCard
              key={row.id}
              job={row.job}
              breakdown={
                (row.job.matches[0]?.breakdown ?? null) as MatchBreakdown | null
              }
              sourceName={jobOriginLabel(row.job.source)}
            />
          ))}
        </div>
      )}
    </Container>
  );
}
