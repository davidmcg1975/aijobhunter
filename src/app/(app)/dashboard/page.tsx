import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getDashboardStats, getTopMatches } from "@/lib/matching/service";
import { loadUserContext } from "@/lib/ai/profile-context";
import { Container, EmptyState, Grid, PageHeader, Stat } from "@/components/ui";
import { JobCard } from "@/components/job-card";
import { formatRelative } from "@/lib/format";
import type { MatchBreakdown } from "@/lib/matching/types";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();

  const [stats, topMatches, context, followUps] = await Promise.all([
    getDashboardStats(user.id),
    getTopMatches(user.id, 5),
    loadUserContext(user.id),
    prisma.application.findMany({
      where: {
        userId: user.id,
        nextFollowUpAt: { lte: new Date() },
        status: { notIn: ["REJECTED", "WITHDRAWN", "ACCEPTED", "EXPIRED"] },
      },
      include: { job: true },
      orderBy: { nextFollowUpAt: "asc" },
      take: 5,
    }),
  ]);

  const setupIncomplete = !context.hasMasterCv || !context.hasProfile;

  return (
    <Container>
      <PageHeader
        title={`Hello, ${user.name.split(" ")[0]}`}
        description="Your contract search at a glance."
      />

      {setupIncomplete && (
        <div className="card" style={{ padding: "1.1rem", marginBottom: "1.4rem" }}>
          <strong>Finish setting up</strong>
          <p className="muted" style={{ margin: "0.4rem 0 0.8rem" }}>
            Match scores are only as good as what the app knows about you.
            {!context.hasMasterCv && " Upload your CV so it can be read and matched."}
            {!context.hasProfile && " Complete your profile to set your rate and IR35 preferences."}
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {!context.hasMasterCv && (
              <Link href="/cv" className="btn btn-primary btn-sm">
                Upload your CV
              </Link>
            )}
            <Link href="/profile" className="btn btn-sm">
              Complete your profile
            </Link>
          </div>
        </div>
      )}

      <Grid min={150}>
        <Stat label="New matches (7 days)" value={stats.newMatches} href="/jobs" />
        <Stat label="High matches" value={stats.highMatches} href="/jobs?minScore=85" />
        <Stat label="Saved jobs" value={stats.saved} href="/saved" />
        <Stat label="Applications" value={stats.applications} href="/applications" />
        <Stat label="Interviews" value={stats.interviews} href="/applications" />
      </Grid>

      {followUps.length > 0 && (
        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.05rem", marginBottom: "0.7rem" }}>
            Follow up today
          </h2>
          <div className="stack" style={{ gap: "0.6rem" }}>
            {followUps.map((application) => (
              <div
                key={application.id}
                className="card"
                style={{
                  padding: "0.9rem 1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <strong>{application.job.title}</strong>
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    {application.appliedAt
                      ? `Applied ${formatRelative(application.appliedAt)}`
                      : "Not yet applied"}
                    {application.recruiterName && ` · ${application.recruiterName}`}
                  </div>
                </div>
                <Link href="/applications" className="btn btn-sm">
                  View application
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={{ marginTop: "2rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "0.7rem",
          }}
        >
          <h2 style={{ fontSize: "1.05rem", margin: 0 }}>Top matches</h2>
          <Link href="/jobs" style={{ fontSize: "0.87rem" }}>
            Search all jobs
          </Link>
        </div>

        {topMatches.length === 0 ? (
          <EmptyState
            title="No matches yet"
            description="Search for contracts to build your job list. Every job you find is scored against your profile."
            action={
              <Link href="/jobs" className="btn btn-primary">
                Search jobs
              </Link>
            }
          />
        ) : (
          <div className="stack" style={{ gap: "0.8rem" }}>
            {topMatches.map((match) => (
              <JobCard
                key={match.id}
                job={match.job}
                breakdown={match.breakdown as unknown as MatchBreakdown}
              />
            ))}
          </div>
        )}
      </section>
    </Container>
  );
}
