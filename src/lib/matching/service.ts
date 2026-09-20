import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { loadUserContext, type UserContext } from "@/lib/ai/profile-context";
import { scoreMatch, type MatchJob } from "./engine";
import { effectiveDescription } from "@/lib/jobsources/description";
import type { MatchBreakdown } from "./types";

/**
 * Persistence for match scores.
 *
 * Scores are stored per (user, job) with the profile version they were
 * computed against, so a profile change makes existing scores stale rather
 * than silently wrong.
 */

function toMatchJob(
  job: Prisma.JobGetPayload<{ include: { analysis: true } }>,
): MatchJob {
  return {
    title: job.title,
    location: job.location,
    description: effectiveDescription(job),
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryPeriod: job.salaryPeriod,
    remote: job.remote,
    ir35: job.ir35,
    analysis: job.analysis
      ? {
          requiredSkills: job.analysis.requiredSkills,
          desirableSkills: job.analysis.desirableSkills,
          responsibilities: job.analysis.responsibilities,
          technologies: job.analysis.technologies,
          testingMethodologies: job.analysis.testingMethodologies,
          aiTestingSkills: job.analysis.aiTestingSkills,
          industry: job.analysis.industry,
          seniority: job.analysis.seniority,
          inferredRateMin: job.analysis.inferredRateMin,
          inferredRateMax: job.analysis.inferredRateMax,
          inferredLengthMonths: job.analysis.inferredLengthMonths,
        }
      : null,
  };
}

export async function computeMatch(params: {
  userId: string;
  jobId: string;
  context?: UserContext;
  force?: boolean;
}): Promise<MatchBreakdown> {
  const { userId, jobId } = params;
  const context = params.context ?? (await loadUserContext(userId));

  const existing = await prisma.jobMatch.findUnique({
    where: { userId_jobId: { userId, jobId } },
  });

  if (
    existing &&
    !params.force &&
    existing.profileVersion === context.version
  ) {
    return existing.breakdown as unknown as MatchBreakdown;
  }

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { analysis: true },
  });
  if (!job) throw new Error("Job not found");

  const breakdown = scoreMatch(context.profile, toMatchJob(job));

  await prisma.jobMatch.upsert({
    where: { userId_jobId: { userId, jobId } },
    create: {
      userId,
      jobId,
      score: breakdown.score,
      recommendation: breakdown.recommendation,
      breakdown: breakdown as unknown as Prisma.InputJsonValue,
      profileVersion: context.version,
    },
    update: {
      score: breakdown.score,
      recommendation: breakdown.recommendation,
      breakdown: breakdown as unknown as Prisma.InputJsonValue,
      profileVersion: context.version,
    },
  });

  return breakdown;
}

/** Scores a batch of jobs for one user, reusing a single profile load. */
export async function computeMatches(params: {
  userId: string;
  jobIds: string[];
  force?: boolean;
}): Promise<Map<string, MatchBreakdown>> {
  const context = await loadUserContext(params.userId);
  const results = new Map<string, MatchBreakdown>();

  for (const jobId of params.jobIds) {
    try {
      results.set(
        jobId,
        await computeMatch({
          userId: params.userId,
          jobId,
          context,
          force: params.force,
        }),
      );
    } catch (error) {
      // One unscoreable job must not stop the rest of the page rendering.
      console.error("[matching] failed to score job", {
        jobId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return results;
}

export async function getTopMatches(userId: string, limit = 5) {
  return prisma.jobMatch.findMany({
    where: {
      userId,
      job: { canonicalId: null, expiredAt: null },
      // Anything the user has already dealt with is not a "new" match.
      NOT: {
        job: {
          OR: [
            { applications: { some: { userId } } },
            { savedBy: { some: { userId } } },
          ],
        },
      },
    },
    include: { job: { include: { analysis: true } } },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
}

export async function getDashboardStats(userId: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [newMatches, highMatches, saved, applications, interviews] =
    await Promise.all([
      prisma.jobMatch.count({
        where: { userId, createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.jobMatch.count({ where: { userId, score: { gte: 85 } } }),
      prisma.savedJob.count({ where: { userId } }),
      prisma.application.count({
        where: {
          userId,
          status: { notIn: ["SAVED", "CONSIDERING"] },
        },
      }),
      prisma.application.count({ where: { userId, status: "INTERVIEW" } }),
    ]);

  return { newMatches, highMatches, saved, applications, interviews };
}
