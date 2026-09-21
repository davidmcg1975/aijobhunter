import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { callAi, parseJsonResponse } from "./client";
import { JOB_ANALYSIS_SYSTEM, PROMPT_VERSION, jobAnalysisPrompt } from "./prompts";
import { canonicaliseList } from "@/lib/matching/skills";
import {
  effectiveDescription,
  isDescriptionIncomplete,
} from "@/lib/jobsources/description";

/**
 * The model is asked for a fixed shape, but its output is still untrusted:
 * everything is validated and coerced before it reaches the database.
 */
const analysisSchema = z.object({
  summary: z.string().default(""),
  requiredSkills: z.array(z.string()).default([]),
  desirableSkills: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  testingMethodologies: z.array(z.string()).default([]),
  aiTestingSkills: z.array(z.string()).default([]),
  industry: z.string().nullable().default(null),
  seniority: z.string().nullable().default(null),
  certifications: z.array(z.string()).default([]),
  inferredIr35: z.enum(["INSIDE", "OUTSIDE", "UNKNOWN"]).default("UNKNOWN"),
  inferredRemote: z.enum(["REMOTE", "HYBRID", "ONSITE", "UNKNOWN"]).default("UNKNOWN"),
  inferredRateMin: z.number().nullable().default(null),
  inferredRateMax: z.number().nullable().default(null),
  inferredLengthMonths: z.number().nullable().default(null),
});

/** Rates outside this band are a model error, not a real UK contract rate. */
function sanitiseRate(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value)) return null;
  if (value < 50 || value > 3000) return null;
  return Math.round(value);
}

export async function analyseJob(jobId: string, userId?: string | null) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { analysis: true },
  });
  if (!job) throw new Error("Job not found");

  // Analyses are shared between users and only re-run when the prompt changes.
  if (job.analysis && job.analysis.promptVersion === PROMPT_VERSION) {
    return job.analysis;
  }

  const response = await callAi({
    operation: "job.analyse",
    userId,
    tier: "analysis",
    system: JOB_ANALYSIS_SYSTEM,
    prompt: jobAnalysisPrompt({
      title: job.title,
      company: job.company,
      location: job.location,
      description: effectiveDescription(job),
      descriptionTruncated: isDescriptionIncomplete(job),
    }),
    maxTokens: 4096,
    // Extraction from a short advert - low effort is enough and much cheaper.
    effort: "low",
  });

  const parsed = analysisSchema.parse(parseJsonResponse(response.text));

  const data = {
    summary: parsed.summary.slice(0, 2000),
    requiredSkills: canonicaliseList(parsed.requiredSkills).slice(0, 40),
    desirableSkills: canonicaliseList(parsed.desirableSkills).slice(0, 40),
    responsibilities: parsed.responsibilities.slice(0, 30),
    technologies: canonicaliseList(parsed.technologies).slice(0, 40),
    testingMethodologies: canonicaliseList(parsed.testingMethodologies).slice(0, 20),
    aiTestingSkills: canonicaliseList(parsed.aiTestingSkills).slice(0, 20),
    industry: parsed.industry?.slice(0, 100) ?? null,
    seniority: parsed.seniority?.slice(0, 50) ?? null,
    certifications: parsed.certifications.slice(0, 20),
    // The advert's own structured fields win over the model's reading of them.
    inferredIr35: job.ir35 !== "UNKNOWN" ? job.ir35 : parsed.inferredIr35,
    inferredRemote: job.remote !== "UNKNOWN" ? job.remote : parsed.inferredRemote,
    inferredRateMin: sanitiseRate(parsed.inferredRateMin),
    inferredRateMax: sanitiseRate(parsed.inferredRateMax),
    inferredLengthMonths:
      parsed.inferredLengthMonths && parsed.inferredLengthMonths > 0 && parsed.inferredLengthMonths <= 60
        ? Math.round(parsed.inferredLengthMonths)
        : null,
    model: response.model,
    promptVersion: PROMPT_VERSION,
  };

  return prisma.jobAnalysis.upsert({
    where: { jobId },
    create: { jobId, ...data },
    update: data,
  });
}
