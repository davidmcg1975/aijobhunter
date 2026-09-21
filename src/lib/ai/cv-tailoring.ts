import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { callAi, AiUnavailableError, parseJsonResponse } from "./client";
import {
  CV_DOCUMENT_TAILORING_SYSTEM,
  CV_TAILORING_SYSTEM,
  cvDocumentTailoringPrompt,
  cvTailoringPrompt,
} from "./prompts";
import { verifyGrounding, type GroundingReport } from "./grounding";
import { loadUserContext } from "./profile-context";
import { audit } from "@/lib/security/audit";
import { effectiveDescription } from "@/lib/jobsources/description";
import { getFile, putFile } from "@/lib/storage";
import { extractCvText } from "@/lib/cv/extract";
import {
  applyDocxEdits,
  DOCX_MIME_TYPE,
  readDocxParagraphs,
} from "@/lib/cv/docx-edit";

const tailoringSchema = z.object({
  tailoredCv: z.string().min(50),
  changes: z
    .array(z.object({ change: z.string(), reason: z.string() }))
    .default([]),
  omittedRequirements: z.array(z.string()).default([]),
});

const documentEditsSchema = z.object({
  rewrites: z
    .array(z.object({ paragraph: z.number().int(), text: z.string() }))
    .default([]),
  remove: z.array(z.number().int()).default([]),
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
  /** True when the result is the user's own Word document, edited in place. */
  keepsFormatting: boolean;
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

  // A Word original is tailored in place, keeping its formatting. A PDF
  // cannot be edited reliably, so it gets the plain-text treatment below.
  if (sourceCv.fileKey && sourceCv.fileMimeType === DOCX_MIME_TYPE) {
    const inPlace = await tailorDocument({
      userId,
      job,
      context,
      sourceCv: { ...sourceCv, fileKey: sourceCv.fileKey, extractedText: sourceCv.extractedText },
    });
    if (inPlace) return inPlace;
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
    keepsFormatting: false,
  };
}

/**
 * Tailors the user's own Word document in place (see src/lib/cv/docx-edit.ts).
 * Returns null when the document has nothing that can safely be edited, so
 * the caller falls back to plain-text tailoring rather than failing.
 */
async function tailorDocument(params: {
  userId: string;
  job: NonNullable<Awaited<ReturnType<typeof prisma.job.findUnique>>>;
  context: Awaited<ReturnType<typeof loadUserContext>>;
  sourceCv: { id: string; fileKey: string; fileName: string | null; extractedText: string };
}): Promise<TailoringResult | null> {
  const { userId, job, context, sourceCv } = params;

  const original = await getFile(userId, sourceCv.fileKey);

  // Locked in code, whatever the model returns: employers, titles and
  // qualifications, on top of the dates and layout lines docx-edit locks.
  const experiences = await prisma.experience.findMany({
    where: { userId },
    select: { company: true, jobTitle: true },
  });
  const lockedPhrases = [
    ...context.grounding.employers,
    ...context.grounding.qualifications,
    ...experiences.flatMap((e) => [e.company, e.jobTitle]),
  ].filter((phrase): phrase is string => Boolean(phrase && phrase.trim()));

  const paragraphs = await readDocxParagraphs(original, lockedPhrases);
  if (!paragraphs.some((p) => !p.locked)) return null;

  const response = await callAi({
    operation: "cv.tailor",
    userId,
    tier: "writing",
    system: CV_DOCUMENT_TAILORING_SYSTEM,
    prompt: cvDocumentTailoringPrompt({
      paragraphs,
      profileSummary: context.summary,
      job: {
        title: job.title,
        company: job.company,
        description: effectiveDescription(job),
      },
    }),
    maxTokens: 8192,
    effort: "high",
  });

  const parsed = documentEditsSchema.parse(parseJsonResponse(response.text));
  const applied = await applyDocxEdits(
    original,
    { rewrites: parsed.rewrites, remove: parsed.remove },
    lockedPhrases,
  );

  const fileName = `${(sourceCv.fileName ?? "CV").replace(/\.docx$/i, "")} - ${job.title}.docx`;
  const { text: tailoredText } = await extractCvText(applied.buffer, fileName);

  // Checked on the whole resulting document, exactly as the text path is.
  const grounding = verifyGrounding(tailoredText, {
    ...context.grounding,
    text: `${context.grounding.text}\n${sourceCv.extractedText}`,
  });

  const stored = await putFile(userId, fileName, applied.buffer);

  const cv = await prisma.cv.create({
    data: {
      userId,
      name: `${job.title}${job.company ? ` - ${job.company}` : ""}`.slice(0, 150),
      kind: "TAILORED",
      isMaster: false,
      fileKey: stored.key,
      fileName,
      fileMimeType: DOCX_MIME_TYPE,
      fileSize: stored.size,
      extractedText: tailoredText,
      sourceCvId: sourceCv.id,
      jobId: job.id,
      changeSummary: {
        changes: parsed.changes,
        omittedRequirements: parsed.omittedRequirements,
        grounding: {
          passed: grounding.passed,
          violations: grounding.violations,
          omissions: grounding.omissions,
        },
        model: response.model,
        keepsFormatting: true,
        edits: {
          rewritten: applied.rewritten.length,
          removed: applied.removed.length,
          // Edits the model attempted on locked paragraphs, refused in code.
          refused: applied.rejected,
        },
      },
    },
  });

  await audit({
    action: "cv.tailored",
    userId,
    entity: "Cv",
    entityId: cv.id,
    metadata: {
      jobId: job.id,
      keepsFormatting: true,
      groundingPassed: grounding.passed,
      violationCount: grounding.violations.length,
      refusedEdits: applied.rejected.length,
    },
  });

  return {
    cvId: cv.id,
    tailoredText,
    changes: parsed.changes,
    omittedRequirements: parsed.omittedRequirements,
    grounding,
    originalText: sourceCv.extractedText,
    keepsFormatting: true,
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
