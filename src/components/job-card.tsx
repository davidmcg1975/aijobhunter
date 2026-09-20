import Link from "next/link";
import { MatchScore } from "./ui";
import {
  formatIr35,
  formatRate,
  formatRelative,
  formatRemote,
} from "@/lib/format";
import type { MatchBreakdown } from "@/lib/matching/types";

type JobSummary = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: string;
  salaryIsPredicted: boolean;
  ir35: string;
  remote: string;
  postedAt: Date | null;
  analysis?: { inferredLengthMonths: number | null } | null;
};

export function JobCard({
  job,
  breakdown,
}: {
  job: JobSummary;
  breakdown?: MatchBreakdown | null;
}) {
  const strengths = breakdown?.strengths.slice(0, 4) ?? [];
  const gaps = breakdown?.gaps.slice(0, 2) ?? [];

  return (
    <article className="card" style={{ padding: "1rem 1.1rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: "1.03rem", fontWeight: 640 }}>
            <Link href={`/jobs/${job.id}`} style={{ textDecoration: "none" }}>
              {job.title}
            </Link>
          </h3>
          {job.company && (
            <div className="muted" style={{ fontSize: "0.88rem" }}>
              {job.company}
            </div>
          )}
        </div>
        {breakdown && <MatchScore score={breakdown.score} />}
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.4rem",
          margin: "0.7rem 0",
        }}
      >
        <span className="badge">
          {formatRate(job.salaryMin, job.salaryMax, job.salaryPeriod)}
          {job.salaryIsPredicted && " (estimated)"}
        </span>
        {job.location && <span className="badge">{job.location}</span>}
        <span className="badge">{formatRemote(job.remote)}</span>
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
        {job.analysis?.inferredLengthMonths && (
          <span className="badge">{job.analysis.inferredLengthMonths} months</span>
        )}
      </div>

      {(strengths.length > 0 || gaps.length > 0) && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.3rem 0.8rem",
            fontSize: "0.83rem",
            marginBottom: "0.7rem",
          }}
        >
          {strengths.map((item) => (
            <span key={item} style={{ color: "var(--success)" }}>
              ✓ {item}
            </span>
          ))}
          {gaps.map((item) => (
            <span key={item} className="subtle">
              ? {item} (not evidenced)
            </span>
          ))}
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Link href={`/jobs/${job.id}`} className="btn btn-sm btn-primary">
          View job
        </Link>
        <Link href={`/jobs/${job.id}#tailor`} className="btn btn-sm">
          Tailor CV
        </Link>
        <span className="subtle" style={{ fontSize: "0.8rem", marginLeft: "auto" }}>
          {formatRelative(job.postedAt)}
        </span>
      </div>
    </article>
  );
}
