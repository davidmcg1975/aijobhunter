import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { computeMatch } from "@/lib/matching/service";
import { PROMPT_VERSION } from "@/lib/ai/prompts";
import { Container } from "@/components/ui";
import { MatchExplanation } from "@/components/match-explanation";
import { JobActions } from "@/components/job-actions";
import { CoverLetterPanel, TailorPanel } from "@/components/tailor-panel";
import { FullDescriptionPanel } from "@/components/full-description-panel";
import {
  effectiveDescription,
  isDescriptionIncomplete,
} from "@/lib/jobsources/description";
import {
  formatDate,
  formatIr35,
  formatRate,
  formatRemote,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      analysis: true,
      duplicates: { select: { id: true, source: true, url: true } },
    },
  });

  if (!job) notFound();

  const [saved, application, breakdown] = await Promise.all([
    prisma.savedJob.findUnique({
      where: { userId_jobId: { userId: user.id, jobId: job.id } },
    }),
    prisma.application.findUnique({
      where: { userId_jobId: { userId: user.id, jobId: job.id } },
    }),
    computeMatch({ userId: user.id, jobId: job.id }),
  ]);

  const lengthMonths = job.analysis?.inferredLengthMonths;

  return (
    <Container width={900}>
      <article className="card" style={{ padding: "1.3rem", marginBottom: "1.2rem" }}>
        <h1 className="page-title" style={{ fontSize: "1.4rem" }}>
          {job.title}
        </h1>
        {job.company && (
          <p className="muted" style={{ margin: "0.25rem 0 0.9rem" }}>
            {job.company}
          </p>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1rem" }}>
          <span className="badge">
            {formatRate(job.salaryMin, job.salaryMax, job.salaryPeriod)}
            {job.salaryIsPredicted && " (estimated)"}
          </span>
          <span
            className={
              job.ir35 === "OUTSIDE"
                ? "badge badge-success"
                : job.ir35 === "INSIDE"
                  ? "badge badge-warning"
                  : "badge"
            }
          >
            {formatIr35(job.ir35)}
          </span>
          {lengthMonths && <span className="badge">{lengthMonths} months</span>}
          {job.location && <span className="badge">{job.location}</span>}
          <span className="badge">{formatRemote(job.remote)}</span>
          {job.postedAt && (
            <span className="badge">Posted {formatDate(job.postedAt)}</span>
          )}
          <span className="badge">via {job.source}</span>
        </div>

        <JobActions
          jobId={job.id}
          jobUrl={job.url}
          isSaved={Boolean(saved)}
          inTracker={Boolean(application)}
          // Stale once the prompts change, so the button comes back and the
          // user can refresh an analysis produced by an older version.
          isAnalysed={job.analysis?.promptVersion === PROMPT_VERSION}
        />

        {job.duplicates.length > 0 && (
          <p className="hint" style={{ marginTop: "0.8rem" }}>
            Also advertised elsewhere:{" "}
            {job.duplicates.map((duplicate, index) => (
              <span key={duplicate.id}>
                {index > 0 && ", "}
                <a
                  href={duplicate.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  {duplicate.source}
                </a>
              </span>
            ))}
          </p>
        )}
      </article>

      <div className="stack" style={{ gap: "1.2rem" }}>
        <MatchExplanation breakdown={breakdown} />

        <FullDescriptionPanel
          jobId={job.id}
          jobUrl={job.url}
          source={job.source}
          extractLength={job.description.length}
          fullLength={job.fullDescription?.length ?? null}
        />

        {job.analysis && (
          <section className="card" style={{ padding: "1.1rem" }}>
            <h2 style={{ margin: "0 0 0.6rem", fontSize: "1.05rem" }}>
              What this role actually involves
            </h2>
            <p style={{ marginTop: 0 }}>{job.analysis.summary}</p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))",
                gap: "1.2rem",
                marginTop: "1rem",
              }}
            >
              <div>
                <h3 style={{ fontSize: "0.92rem", margin: "0 0 0.4rem" }}>Required</h3>
                {job.analysis.requiredSkills.length === 0 ? (
                  <p className="muted" style={{ fontSize: "0.87rem", margin: 0 }}>
                    The advert does not state specific requirements.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                    {job.analysis.requiredSkills.map((skill) => (
                      <span key={skill} className="badge">
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {job.analysis.desirableSkills.length > 0 && (
                <div>
                  <h3 style={{ fontSize: "0.92rem", margin: "0 0 0.4rem" }}>Desirable</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                    {job.analysis.desirableSkills.map((skill) => (
                      <span key={skill} className="badge">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {job.analysis.aiTestingSkills.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <h3 style={{ fontSize: "0.92rem", margin: "0 0 0.4rem" }}>
                  AI / LLM testing content
                </h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                  {job.analysis.aiTestingSkills.map((skill) => (
                    <span key={skill} className="badge badge-accent">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {job.analysis.responsibilities.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <h3 style={{ fontSize: "0.92rem", margin: "0 0 0.4rem" }}>
                  Responsibilities
                </h3>
                <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.9rem" }}>
                  {job.analysis.responsibilities.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <TailorPanel jobId={job.id} />
        <CoverLetterPanel jobId={job.id} />

        <section className="card" style={{ padding: "1.1rem" }}>
          <h2 style={{ margin: "0 0 0.6rem", fontSize: "1.05rem" }}>
            {job.fullDescription ? "Full advert" : "Original advert"}
          </h2>
          {isDescriptionIncomplete(job) && (
            <div className="alert alert-warning" style={{ marginBottom: "0.9rem" }}>
              <strong>This is only an extract.</strong> {job.source} returns
              roughly the first 500 characters of an advert through its API, not
              the full text. Requirements, rate and IR35 status may all be
              stated in the part shown below the cut &mdash; open the original
              advert before deciding, and treat the match score as based on
              partial information.
            </div>
          )}
          {/* Provider text is rendered as plain text, never as HTML. */}
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontFamily: "inherit",
              fontSize: "0.89rem",
              margin: 0,
              color: "var(--text-muted)",
            }}
          >
            {effectiveDescription(job)}
          </pre>
          {job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="btn btn-sm"
              style={{ marginTop: "1rem" }}
            >
              Open original advert on {job.source}
            </a>
          )}
        </section>
      </div>
    </Container>
  );
}
