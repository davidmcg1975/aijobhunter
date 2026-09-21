"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/security/audit";
import { RateLimitedError, checkRateLimit } from "@/lib/security/rate-limit";
import { ingestFromAllSources } from "@/lib/jobsources/ingest";
import { availableSources } from "@/lib/jobsources/credentials";
import { analyseJob } from "@/lib/ai/job-analysis";
import { computeMatch, computeMatches } from "@/lib/matching/service";
import { AiUnavailableError } from "@/lib/ai/client";
import { aiAvailableFor } from "@/lib/ai/credentials";
import type { JobSearchCriteria } from "@/lib/jobsources/types";
import {
  tidyPastedDescription,
  validatePastedDescription,
} from "@/lib/jobsources/description";
import { detectIr35, detectRemote } from "@/lib/jobsources/parse";

export type ActionResult = {
  error?: string;
  success?: string;
  /** After a live search: what was searched, so the list can show just that. */
  searched?: { keywords: string; mode: "all" | "any" | "phrase" };
};

const searchSchema = z.object({
  keywords: z.string().trim().max(200).optional(),
  keywordMode: z.enum(["all", "any", "phrase"]).optional(),
  location: z.string().trim().max(100).optional(),
  radiusMiles: z.coerce.number().int().min(1).max(200).optional(),
  minDayRate: z.coerce.number().int().min(0).max(5000).optional(),
  postedWithinDays: z.coerce.number().int().min(1).max(60).optional(),
});

/**
 * Pulls fresh jobs from every configured source and scores them.
 *
 * Search is a write operation here: results go into the shared job database so
 * they are searchable instantly next time and can be analysed in the
 * background. See docs/architecture.md.
 */
export async function fetchJobsAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();

  if ((await availableSources(user.id)).length === 0) {
    return {
      error: "No job source is set up. Add an Adzuna key under Settings → API keys.",
    };
  }

  try {
    await checkRateLimit("jobSearch", user.id);
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return { error: "Slow down a moment - too many searches." };
    }
    throw error;
  }

  const parsed = searchSchema.safeParse({
    keywords: formData.get("keywords") || undefined,
    keywordMode: formData.get("keywordMode") || undefined,
    location: formData.get("location") || undefined,
    radiusMiles: formData.get("radiusMiles") || undefined,
    minDayRate: formData.get("minDayRate") || undefined,
    postedWithinDays: formData.get("postedWithinDays") || undefined,
  });

  if (!parsed.success) return { error: "Check your search criteria." };

  const criteria: JobSearchCriteria = {
    ...parsed.data,
    contractType: "CONTRACT",
    perPage: 30,
    sortBy: "date",
  };

  const summaries = await ingestFromAllSources(criteria, user.id);
  const failed = summaries.filter((s) => s.error);
  const created = summaries.reduce((sum, s) => sum + s.created, 0);
  const received = summaries.reduce((sum, s) => sum + s.received, 0);
  const duplicates = summaries.reduce((sum, s) => sum + s.duplicates, 0);
  const updated = summaries.reduce((sum, s) => sum + s.updated, 0);
  const skipped = summaries.reduce((sum, s) => sum + s.skipped, 0);

  if (failed.length === summaries.length && summaries.length > 0) {
    return { error: failed[0]!.error! };
  }

  // Score everything that came back so the list is useful immediately.
  const recent = await prisma.job.findMany({
    where: { canonicalId: null },
    orderBy: { retrievedAt: "desc" },
    take: 60,
    select: { id: true },
  });
  await computeMatches({ userId: user.id, jobIds: recent.map((j) => j.id) });

  revalidatePath("/jobs");

  return {
    success: `Found ${received} adverts.${
      skipped ? ` ${skipped} did not match your words and were skipped.` : ""
    } Kept ${received - skipped}: ${created} new, ${updated} already stored (refreshed), ${duplicates} duplicates of other listings.${
      failed.length ? ` ${failed.length} source(s) failed.` : ""
    }`,
    searched: parsed.data.keywords
      ? { keywords: parsed.data.keywords, mode: parsed.data.keywordMode ?? "all" }
      : undefined,
  };
}

export async function analyseJobAction(jobId: string): Promise<ActionResult> {
  const user = await requireUser();

  if (!(await aiAvailableFor(user.id))) {
    return { error: "AI features are not set up. Choose an AI provider and add its API key under Settings." };
  }

  try {
    await checkRateLimit("aiOperation", user.id);
    await analyseJob(jobId, user.id);
    // The analysis changes the inputs to scoring, so re-score.
    await computeMatch({ userId: user.id, jobId, force: true });
    await audit({ action: "job.analysed", userId: user.id, entity: "Job", entityId: jobId });
    revalidatePath(`/jobs/${jobId}`);
    return { success: "Job analysed." };
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return { error: "You have used a lot of AI operations recently. Try again shortly." };
    }
    if (error instanceof AiUnavailableError) return { error: error.message };
    console.error("[jobs] analysis failed", {
      jobId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { error: "The job could not be analysed. Please try again." };
  }
}

export async function toggleSaveJobAction(jobId: string): Promise<ActionResult> {
  const user = await requireUser();

  const existing = await prisma.savedJob.findUnique({
    where: { userId_jobId: { userId: user.id, jobId } },
  });

  if (existing) {
    await prisma.savedJob.delete({ where: { id: existing.id } });
    revalidatePath("/saved");
    revalidatePath(`/jobs/${jobId}`);
    return { success: "Removed from saved jobs." };
  }

  await prisma.savedJob.create({ data: { userId: user.id, jobId } });
  revalidatePath("/saved");
  revalidatePath(`/jobs/${jobId}`);
  return { success: "Saved." };
}

export async function addToApplicationsAction(jobId: string): Promise<ActionResult> {
  const user = await requireUser();

  const existing = await prisma.application.findUnique({
    where: { userId_jobId: { userId: user.id, jobId } },
  });
  if (existing) return { success: "Already in your application tracker." };

  const application = await prisma.application.create({
    data: { userId: user.id, jobId, status: "CONSIDERING" },
  });

  await prisma.applicationEvent.create({
    data: {
      applicationId: application.id,
      userId: user.id,
      kind: "created",
      detail: "Added to tracker",
    },
  });

  await audit({
    action: "application.created",
    userId: user.id,
    entity: "Application",
    entityId: application.id,
    metadata: { jobId },
  });

  revalidatePath("/applications");
  revalidatePath(`/jobs/${jobId}`);
  return { success: "Added to your application tracker." };
}

export async function rescoreAllAction(): Promise<ActionResult> {
  const user = await requireUser();

  const jobs = await prisma.job.findMany({
    where: { canonicalId: null },
    select: { id: true },
    take: 300,
    orderBy: { retrievedAt: "desc" },
  });

  await computeMatches({ userId: user.id, jobIds: jobs.map((j) => j.id), force: true });
  revalidatePath("/jobs");
  revalidatePath("/dashboard");

  return { success: `Re-scored ${jobs.length} jobs against your profile.` };
}

/**
 * Stores the full advert text a user pasted from the original posting.
 *
 * Job boards return a short extract, which caps the quality of the analysis and
 * every match score derived from it. Pasting the real advert lifts that ceiling,
 * so the stored analysis is discarded and rebuilt from the better source.
 */
export async function saveFullDescriptionAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();

  const jobId = String(formData.get("jobId") ?? "");
  const pasted = String(formData.get("fullDescription") ?? "");
  if (!jobId) return { error: "No job specified." };

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, description: true, fullDescription: true },
  });
  if (!job) return { error: "That job could not be found." };

  const problem = validatePastedDescription(
    pasted,
    job.fullDescription ?? job.description,
  );
  if (problem) return { error: problem };

  const text = tidyPastedDescription(pasted);

  await prisma.job.update({
    where: { id: job.id },
    data: {
      fullDescription: text,
      fullDescriptionAddedAt: new Date(),
      fullDescriptionAddedBy: user.id,
      // Re-read the deterministic facts from the better text. These drive
      // search and filtering even when the AI is unavailable.
      ir35: detectIr35(text),
      remote: detectRemote(text),
      // No longer a fragment.
      descriptionTruncated: false,
    },
  });

  // The stored analysis was produced from the extract, so it is now obsolete.
  await prisma.jobAnalysis.deleteMany({ where: { jobId: job.id } });

  await audit({
    action: "job.description_added",
    userId: user.id,
    entity: "Job",
    entityId: job.id,
    metadata: { characters: text.length, wasCharacters: job.description.length },
  });

  let analysed = false;
  if (await aiAvailableFor(user.id)) {
    try {
      await checkRateLimit("aiOperation", user.id);
      await analyseJob(job.id, user.id);
      analysed = true;
    } catch (error) {
      // The text is saved either way; a failed re-analysis is not a failed save.
      console.error("[jobs] re-analysis after paste failed", {
        jobId: job.id,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  await computeMatch({ userId: user.id, jobId: job.id, force: true });

  revalidatePath(`/jobs/${job.id}`);
  revalidatePath("/jobs");

  return {
    success: analysed
      ? `Saved ${text.length.toLocaleString("en-GB")} characters and re-analysed the role. Your match score now reflects the full advert.`
      : `Saved ${text.length.toLocaleString("en-GB")} characters. Analyse the job to rebuild the requirements from it.`,
  };
}
