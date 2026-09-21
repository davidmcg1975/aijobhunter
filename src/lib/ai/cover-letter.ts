import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AiUnavailableError, callAi, parseJsonResponse } from "./client";
import { COVER_LETTER_SYSTEM, coverLetterPrompt } from "./prompts";
import { verifyGrounding, type GroundingReport } from "./grounding";
import { loadUserContext } from "./profile-context";
import { audit } from "@/lib/security/audit";
import { effectiveDescription } from "@/lib/jobsources/description";

export const COVER_LETTER_TONES = [
  "Professional",
  "Formal",
  "Concise",
  "Enthusiastic",
] as const;

export type CoverLetterTone = (typeof COVER_LETTER_TONES)[number];

const letterSchema = z.object({
  letter: z.string().min(50),
  claimsMade: z.array(z.string()).default([]),
});

export type CoverLetterResult = {
  id: string;
  content: string;
  claimsMade: string[];
  grounding: GroundingReport;
};

export async function generateCoverLetter(params: {
  userId: string;
  jobId: string;
  tone: CoverLetterTone;
}): Promise<CoverLetterResult> {
  const { userId, jobId, tone } = params;

  const [job, context] = await Promise.all([
    prisma.job.findUnique({ where: { id: jobId } }),
    loadUserContext(userId),
  ]);

  if (!job) throw new Error("Job not found");
  if (!context.hasMasterCv && !context.hasProfile) {
    throw new AiUnavailableError(
      "Complete your profile or upload a CV first - there is nothing to write from.",
    );
  }

  const response = await callAi({
    operation: "coverletter.generate",
    userId,
    tier: "writing",
    system: COVER_LETTER_SYSTEM,
    prompt: coverLetterPrompt({
      profileSummary: context.summary,
      cvText: context.masterCvText,
      tone,
      job: {
        title: job.title,
        company: job.company,
        description: effectiveDescription(job),
      },
    }),
    maxTokens: 2048,
    effort: "high",
  });

  const parsed = letterSchema.parse(parseJsonResponse(response.text));
  const grounding = verifyGrounding(parsed.letter, context.grounding);

  const letter = await prisma.coverLetter.create({
    data: { userId, jobId, tone, content: parsed.letter },
  });

  await audit({
    action: "coverletter.generated",
    userId,
    entity: "CoverLetter",
    entityId: letter.id,
    metadata: { jobId, tone, groundingPassed: grounding.passed },
  });

  return {
    id: letter.id,
    content: parsed.letter,
    claimsMade: parsed.claimsMade,
    grounding,
  };
}

// --- Recruiter messages ----------------------------------------------------

export const RECRUITER_CHANNELS = ["Email", "LinkedIn", "WhatsApp", "Generic"] as const;
export type RecruiterChannel = (typeof RECRUITER_CHANNELS)[number];

const CHANNEL_GUIDANCE: Record<RecruiterChannel, string> = {
  Email: "A short email with a subject line. Four sentences at most.",
  LinkedIn: "A LinkedIn message under 900 characters. No subject line, no greeting block.",
  WhatsApp: "Two or three sentences, plain and direct, as you would send by text.",
  Generic: "A short message that works on any recruiter portal or contact form.",
};

/**
 * Drafts a message to a recruiter. Never sent automatically - the caller shows
 * it to the user to review, edit and send themselves.
 */
export async function draftRecruiterMessage(params: {
  userId: string;
  jobId: string;
  channel: RecruiterChannel;
}): Promise<{ content: string; grounding: GroundingReport }> {
  const [job, context] = await Promise.all([
    prisma.job.findUnique({ where: { id: params.jobId } }),
    loadUserContext(params.userId),
  ]);

  if (!job) throw new Error("Job not found");

  const response = await callAi({
    operation: "coverletter.generate",
    userId: params.userId,
    tier: "writing",
    system: COVER_LETTER_SYSTEM,
    prompt: `
Draft a message to the recruiter advertising this role.

CHANNEL: ${params.channel}
FORMAT: ${CHANNEL_GUIDANCE[params.channel]}

=== VERIFIED PROFILE (source of truth) ===
${context.summary}

=== VACANCY ===
TITLE: ${job.title}
COMPANY: ${job.company ?? "not stated"}
"""
${effectiveDescription(job).slice(0, 12000)}
"""

Return JSON: { "letter": "the message", "claimsMade": ["each factual claim made"] }
`.trim(),
    maxTokens: 1024,
    effort: "medium",
  });

  const parsed = letterSchema.parse(parseJsonResponse(response.text));
  return {
    content: parsed.letter,
    grounding: verifyGrounding(parsed.letter, context.grounding),
  };
}
