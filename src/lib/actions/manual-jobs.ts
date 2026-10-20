"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/security/audit";
import { RateLimitedError, checkRateLimit } from "@/lib/security/rate-limit";
import { aiAvailableFor } from "@/lib/ai/credentials";
import { readJobDetails } from "@/lib/ai/job-details";
import { analyseJob } from "@/lib/ai/job-analysis";
import { computeMatch } from "@/lib/matching/service";
import { fingerprint } from "@/lib/jobsources/dedupe";
import { visibleToUser } from "@/lib/jobsources/visibility";
import {
  buildManualDraft,
  MANUAL_SOURCE,
  MAX_ADVERT_LENGTH,
  MIN_ADVERT_LENGTH,
  validateManualJob,
  type ManualJobDraft,
  type ManualJobInput,
} from "@/lib/jobsources/manual";

/**
 * Adding a job the application cannot search for - from LinkedIn, an agency
 * site, or a recruiter's email.
 *
 * Two steps on purpose. The advert is read into a draft the user corrects,
 * because the AI gets a title or a rate wrong often enough that saving
 * straight from it would put bad data behind every score and document.
 */

export type DraftState = {
  error?: string;
  draft?: ManualJobDraft & { advert: string };
  /** True when the draft came from the parsers alone, with no AI key set up. */
  parsedOnly?: boolean;
};

export async function draftManualJobAction(
  _previous: DraftState,
  formData: FormData,
): Promise<DraftState> {
  const user = await requireUser();
  const advert = String(formData.get("advert") ?? "").trim();

  if (advert.length < MIN_ADVERT_LENGTH) {
    return {
      error: `Paste the whole advert - that is only ${advert.length} characters, and everything is built from it.`,
    };
  }
  if (advert.length > MAX_ADVERT_LENGTH) {
    return { error: "That is longer than any job advert. Paste just the advert." };
  }

  try {
    await checkRateLimit("aiOperation", user.id);
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return { error: "Too many requests recently. Try again shortly." };
    }
    throw error;
  }

  if (!(await aiAvailableFor(user.id))) {
    // Still usable without AI: the parsers fill what they can and the user
    // types the rest.
    return { draft: { ...buildManualDraft(advert), advert }, parsedOnly: true };
  }

  try {
    const details = await readJobDetails({ advert, userId: user.id });
    return { draft: { ...buildManualDraft(advert, details), advert } };
  } catch (error) {
    console.error("[manual-jobs] reading the advert failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    // A failed read is not a failed paste: fall back rather than lose the text.
    return { draft: { ...buildManualDraft(advert), advert }, parsedOnly: true };
  }
}

export type SaveJobState = { error?: string; success?: string; jobId?: string };

export async function createManualJobAction(
  _previous: SaveJobState,
  formData: FormData,
): Promise<SaveJobState> {
  const user = await requireUser();

  const input: ManualJobInput = {
    advert: String(formData.get("advert") ?? ""),
    title: String(formData.get("title") ?? ""),
    company: String(formData.get("company") ?? ""),
    location: String(formData.get("location") ?? ""),
    url: String(formData.get("url") ?? ""),
    rateMin: String(formData.get("rateMin") ?? ""),
    rateMax: String(formData.get("rateMax") ?? ""),
    ir35: String(formData.get("ir35") ?? ""),
    remote: String(formData.get("remote") ?? ""),
  };

  const validated = validateManualJob(input);
  if (!validated.ok) return { error: validated.error };
  const fields = validated.job;

  const fp = fingerprint(fields);

  // The same advert may already be here from a job board, or added twice.
  const existing = await prisma.job.findFirst({
    where: { fingerprint: fp, canonicalId: null, ...visibleToUser(user.id) },
    select: { id: true, title: true },
  });
  if (existing) {
    return {
      error: `"${existing.title}" is already in your jobs - open it rather than adding it again.`,
      jobId: existing.id,
    };
  }

  const job = await prisma.job.create({
    data: {
      source: MANUAL_SOURCE,
      sourceJobId: randomUUID(),
      title: fields.title,
      company: fields.company,
      // Pasted by hand, so this is the whole advert, not an extract.
      description: fields.advert,
      descriptionTruncated: false,
      location: fields.location,
      salaryMin: fields.salaryMin,
      salaryMax: fields.salaryMax,
      salaryPeriod: fields.salaryPeriod,
      contractType: fields.contractType,
      ir35: fields.ir35,
      remote: fields.remote,
      url: fields.url,
      postedAt: new Date(),
      fingerprint: fp,
      addedByUserId: user.id,
    },
  });

  await audit({
    action: "job.added_manually",
    userId: user.id,
    entity: "Job",
    entityId: job.id,
    // The advert text is not recorded here - only that one was added.
    metadata: { characters: fields.advert.length, hasUrl: Boolean(fields.url) },
  });

  // Analysis and scoring are what make the job useful; a failure in either
  // must not lose the job the user just typed in.
  try {
    if (await aiAvailableFor(user.id)) await analyseJob(job.id, user.id);
  } catch (error) {
    console.error("[manual-jobs] analysis failed", {
      jobId: job.id,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
  try {
    await computeMatch({ userId: user.id, jobId: job.id, force: true });
  } catch (error) {
    console.error("[manual-jobs] scoring failed", {
      jobId: job.id,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  revalidatePath("/jobs");
  revalidatePath("/dashboard");

  return { success: "Job added.", jobId: job.id };
}
