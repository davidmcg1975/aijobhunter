import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { callAi, AiUnavailableError, parseJsonResponse } from "./client";
import { CV_TAILORING_SYSTEM, cvTailoringPrompt } from "./prompts";
import { verifyGrounding, type GroundingReport } from "./grounding";
import { loadUserContext } from "./profile-context";
import { audit } from "@/lib/security/audit";
import { effectiveDescription } from "@/lib/jobsources/description";

const tailoringSchema = z.object({
  tailoredCv: z.string().min(50),
  changes: z
    .array(z.object({ change: z.string(), reason: z.string() }))
    .default([]),
  omittedRequirements: z.array(z.string()).default([]),
});

export type TailoringResult = {
  cvId: string;
  tailoredText: string;
  changes: Array<{ change: string; reason: string }>;
  omittedRequirements: string[];
  grounding: GroundingReport;
  originalText: string;
};

/**
 * Produces a tailored CV for a specific vacancy.
 *
 * The master CV is never modified: the result is always a new Cv row with
 * kind TAILORED, linked back to its source. Output is checked against the
 * user's verified material before being saved, and any discrepancy is stored
 * with the CV so the user sees it rather than discovering it in an interview.
 */
export async function tailorCv(params: {
  userId: string;
  jobId: string;
  sourceCvId?: string;
}): Promise<TailoringResult> {
  const { userId, jobId } = params;

  const [job, context] = await Promise.all([
    prisma.job.findUnique({ where: { id: jobId } }),
    loadUserContext(userId),
  ]);

  if (!job) throw new Error("Job not found");

  const sourceCv = params.sourceCvId
    ? await prisma.cv.findFirst({
        where: { id: params.sourceCvId, userId },
      })
    : await prisma.cv.findFirst({
        where: { userId, isMaster: true },
        orderBy: { updatedAt: "desc" },
      });

  if (!sourceCv?.extractedText) {
    throw new AiUnavailableError(
      "Upload a master CV before tailoring - there is nothing to tailor from.",
    );
  }

  const response = await callAi({
    operation: "cv.tailor",
    userId,
    tier: "writing",
    system: CV_TAILORING_SYSTEM,
    prompt: cvTailoringPrompt({
      masterCv: sourceCv.extractedText,
      profileSummary: context.summary,
      job: {
        title: job.title,
        company: job.company,
        description: effectiveDescription(job),
      },
    }),
    maxTokens: 8192,
    // The output goes to an employer - worth the extra thinking.
    effort: "high",
  });

  const parsed = tailoringSchema.parse(parseJsonResponse(response.text));

  // The prompt forbids invention; this checks whether it actually complied.
  const grounding = verifyGrounding(parsed.tailoredCv, {
    ...context.grounding,
    text: `${context.grounding.text}\n${sourceCv.extractedText}`,
  });

  const cv = await prisma.cv.create({
    data: {
      userId,
      name: `${job.title}${job.company ? ` - ${job.company}` : ""}`.slice(0, 150),
      kind: "TAILORED",
      isMaster: false,
      extractedText: parsed.tailoredCv,
      sourceCvId: sourceCv.id,
      jobId,
      changeSummary: {
        changes: parsed.changes,
        omittedRequirements: parsed.omittedRequirements,
        grounding: {
          passed: grounding.passed,
          violations: grounding.violations,
          omissions: grounding.omissions,
        },
        model: response.model,
      },
    },
  });

  await audit({
    action: "cv.tailored",
    userId,
    entity: "Cv",
    entityId: cv.id,
    metadata: {
      jobId,
      groundingPassed: grounding.passed,
      violationCount: grounding.violations.length,
    },
  });

  return {
    cvId: cv.id,
    tailoredText: parsed.tailoredCv,
    changes: parsed.changes,
    omittedRequirements: parsed.omittedRequirements,
    grounding,
    originalText: sourceCv.extractedText,
  };
}

// --- CV comparison ---------------------------------------------------------

export type DiffLine = {
  kind: "added" | "removed" | "unchanged";
  text: string;
};

/**
 * Line-level diff for the side-by-side comparison view. Longest common
 * subsequence, which is enough for CV-sized documents and avoids a dependency.
 */
export function diffLines(original: string, tailored: string): DiffLine[] {
  const a = original.split("\n").map((l) => l.trim()).filter(Boolean);
  const b = tailored.split("\n").map((l) => l.trim()).filter(Boolean);

  const lengths: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i]![j] =
        a[i] === b[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      result.push({ kind: "unchanged", text: a[i]! });
      i += 1;
      j += 1;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      result.push({ kind: "removed", text: a[i]! });
      i += 1;
    } else {
      result.push({ kind: "added", text: b[j]! });
      j += 1;
    }
  }
  while (i < a.length) result.push({ kind: "removed", text: a[i++]! });
  while (j < b.length) result.push({ kind: "added", text: b[j++]! });

  return result;
}
