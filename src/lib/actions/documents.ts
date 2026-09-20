"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { RateLimitedError, checkRateLimit } from "@/lib/security/rate-limit";
import { AiUnavailableError } from "@/lib/ai/client";
import { diffLines, tailorCv, type TailoringResult } from "@/lib/ai/cv-tailoring";
import {
  COVER_LETTER_TONES,
  RECRUITER_CHANNELS,
  draftRecruiterMessage,
  generateCoverLetter,
  type CoverLetterTone,
  type RecruiterChannel,
} from "@/lib/ai/cover-letter";
import type { GroundingReport } from "@/lib/ai/grounding";
import { features } from "@/lib/env";

export type TailorState = {
  error?: string;
  result?: TailoringResult & { diff: ReturnType<typeof diffLines> };
};

export async function tailorCvAction(
  _previous: TailorState,
  formData: FormData,
): Promise<TailorState> {
  const user = await requireUser();
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return { error: "No job specified." };

  if (!features.ai()) {
    return { error: "AI features are not configured on this installation." };
  }

  try {
    await checkRateLimit("aiOperation", user.id);
    const result = await tailorCv({ userId: user.id, jobId });
    revalidatePath("/cv");
    return {
      result: {
        ...result,
        diff: diffLines(result.originalText, result.tailoredText),
      },
    };
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return { error: "Too many AI requests recently. Try again shortly." };
    }
    if (error instanceof AiUnavailableError) return { error: error.message };
    console.error("[documents] tailoring failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return { error: "The CV could not be tailored. Please try again." };
  }
}

export type LetterState = {
  error?: string;
  content?: string;
  grounding?: GroundingReport;
  claimsMade?: string[];
};

export async function generateCoverLetterAction(
  _previous: LetterState,
  formData: FormData,
): Promise<LetterState> {
  const user = await requireUser();
  const jobId = String(formData.get("jobId") ?? "");
  const tone = String(formData.get("tone") ?? "Professional") as CoverLetterTone;

  if (!jobId) return { error: "No job specified." };
  if (!COVER_LETTER_TONES.includes(tone)) return { error: "Unknown tone." };
  if (!features.ai()) {
    return { error: "AI features are not configured on this installation." };
  }

  try {
    await checkRateLimit("aiOperation", user.id);
    const result = await generateCoverLetter({ userId: user.id, jobId, tone });
    return {
      content: result.content,
      grounding: result.grounding,
      claimsMade: result.claimsMade,
    };
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return { error: "Too many AI requests recently. Try again shortly." };
    }
    if (error instanceof AiUnavailableError) return { error: error.message };
    console.error("[documents] cover letter failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return { error: "The letter could not be generated. Please try again." };
  }
}

export async function draftRecruiterMessageAction(
  _previous: LetterState,
  formData: FormData,
): Promise<LetterState> {
  const user = await requireUser();
  const jobId = String(formData.get("jobId") ?? "");
  const channel = String(formData.get("channel") ?? "Email") as RecruiterChannel;

  if (!jobId) return { error: "No job specified." };
  if (!RECRUITER_CHANNELS.includes(channel)) return { error: "Unknown channel." };
  if (!features.ai()) {
    return { error: "AI features are not configured on this installation." };
  }

  try {
    await checkRateLimit("aiOperation", user.id);
    const result = await draftRecruiterMessage({ userId: user.id, jobId, channel });
    return { content: result.content, grounding: result.grounding };
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return { error: "Too many AI requests recently. Try again shortly." };
    }
    if (error instanceof AiUnavailableError) return { error: error.message };
    return { error: "The message could not be drafted. Please try again." };
  }
}

// CV deletion lives in src/lib/actions/cv.ts, which also removes the stored
// file from object storage. Do not add a second copy here.
