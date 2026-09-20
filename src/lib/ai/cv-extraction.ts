import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { callAi, parseJsonResponse } from "./client";
import { CV_EXTRACTION_SYSTEM, cvExtractionPrompt } from "./prompts";
import { canonicaliseList } from "@/lib/matching/skills";

/**
 * Turns an uploaded CV into structured data.
 *
 * Nothing here writes to the Profile. The extraction is stored on the Cv row
 * and shown to the user for confirmation first - the structured profile is the
 * source of truth, and it must be something the user has agreed to, not
 * something the AI decided on their behalf.
 */

const experienceSchema = z.object({
  company: z.string().min(1),
  jobTitle: z.string().min(1),
  startDate: z.string().nullable().default(null),
  endDate: z.string().nullable().default(null),
  isCurrent: z.boolean().default(false),
  location: z.string().nullable().default(null),
  industry: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  responsibilities: z.array(z.string()).default([]),
  achievements: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
});

const extractionSchema = z.object({
  headline: z.string().nullable().default(null),
  location: z.string().nullable().default(null),
  yearsExperience: z.number().nullable().default(null),
  jobTitles: z.array(z.string()).default([]),
  industries: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  testingMethodologies: z.array(z.string()).default([]),
  aiTestingSkills: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
  qualifications: z.array(z.string()).default([]),
  softSkills: z.array(z.string()).default([]),
  managementExperience: z.string().nullable().default(null),
  experiences: z.array(experienceSchema).default([]),
});

export type ExtractedCv = z.infer<typeof extractionSchema>;

/** "2019-03" or "2019" -> Date. Returns null rather than guessing. */
export function parseCvDate(value: string | null): Date | null {
  if (!value) return null;
  const monthly = value.match(/^(\d{4})-(\d{1,2})$/);
  if (monthly) {
    const year = Number(monthly[1]);
    const month = Number(monthly[2]);
    if (year >= 1950 && year <= 2100 && month >= 1 && month <= 12) {
      return new Date(Date.UTC(year, month - 1, 1));
    }
    return null;
  }
  const yearly = value.match(/^(\d{4})$/);
  if (yearly) {
    const year = Number(yearly[1]);
    if (year >= 1950 && year <= 2100) return new Date(Date.UTC(year, 0, 1));
  }
  return null;
}

export async function extractCvStructure(params: {
  cvId: string;
  userId: string;
  text: string;
}): Promise<ExtractedCv> {
  const config = env();

  const response = await callAi({
    operation: "cv.extract",
    userId: params.userId,
    model: config.AI_MODEL_ANALYSIS,
    system: CV_EXTRACTION_SYSTEM,
    prompt: cvExtractionPrompt(params.text),
    maxTokens: 8192,
    // Transcription task, but a long one - medium keeps it accurate.
    effort: "medium",
  });

  const parsed = extractionSchema.parse(parseJsonResponse(response.text));

  const structured: ExtractedCv = {
    ...parsed,
    technologies: canonicaliseList(parsed.technologies).slice(0, 80),
    testingMethodologies: canonicaliseList(parsed.testingMethodologies).slice(0, 30),
    aiTestingSkills: canonicaliseList(parsed.aiTestingSkills).slice(0, 20),
    certifications: parsed.certifications.slice(0, 30),
    qualifications: parsed.qualifications.slice(0, 30),
    experiences: parsed.experiences.slice(0, 30),
  };

  // Stored against the CV, not merged into the profile - see the note above.
  await prisma.cv.update({
    where: { id: params.cvId },
    data: { structured },
  });

  return structured;
}

/**
 * Applies a confirmed extraction to the user's profile.
 *
 * Called only from an explicit user action. Existing values are merged rather
 * than replaced, so a second CV upload never silently deletes something the
 * user typed themselves.
 */
export async function applyExtractionToProfile(params: {
  userId: string;
  cvId: string;
  extraction: ExtractedCv;
  replaceExperience: boolean;
}): Promise<void> {
  const { userId, cvId, extraction } = params;
  const provenanceKey = `cv:${cvId}`;

  const existing = await prisma.profile.findUnique({ where: { userId } });

  const merge = (current: string[] | undefined, incoming: string[]): string[] => {
    const seen = new Map<string, string>();
    for (const value of [...(current ?? []), ...incoming]) {
      const key = value.trim().toLowerCase();
      if (key && !seen.has(key)) seen.set(key, value.trim());
    }
    return [...seen.values()];
  };

  const provenance = {
    ...((existing?.provenance as Record<string, string>) ?? {}),
    technologies: provenanceKey,
    industries: provenanceKey,
    certifications: provenanceKey,
    qualifications: provenanceKey,
  };

  const data = {
    headline: existing?.headline ?? extraction.headline,
    location: existing?.location ?? extraction.location,
    yearsExperience: existing?.yearsExperience ?? extraction.yearsExperience,
    managementExperience:
      existing?.managementExperience ?? extraction.managementExperience,
    jobTitles: merge(existing?.jobTitles, extraction.jobTitles),
    industries: merge(existing?.industries, extraction.industries),
    technologies: merge(existing?.technologies, extraction.technologies),
    testingMethodologies: merge(
      existing?.testingMethodologies,
      extraction.testingMethodologies,
    ),
    aiTestingSkills: merge(existing?.aiTestingSkills, extraction.aiTestingSkills),
    certifications: merge(existing?.certifications, extraction.certifications),
    qualifications: merge(existing?.qualifications, extraction.qualifications),
    softSkills: merge(existing?.softSkills, extraction.softSkills),
    provenance,
  };

  await prisma.profile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  if (params.replaceExperience) {
    // Only ever removes rows this same CV created, never hand-typed history.
    await prisma.experience.deleteMany({
      where: { userId, source: provenanceKey },
    });

    const rows = extraction.experiences
      .map((exp, index) => {
        // A role with no usable date is kept with a null date, not discarded.
        // Real CVs list early roles without dates, and silently dropping half
        // someone's career is worse than recording that a date is unknown.
        const startDate = parseCvDate(exp.startDate);
        return {
          userId,
          company: exp.company.slice(0, 200),
          jobTitle: exp.jobTitle.slice(0, 200),
          startDate,
          endDate: parseCvDate(exp.endDate),
          isCurrent: exp.isCurrent,
          location: exp.location?.slice(0, 200) ?? null,
          industry: exp.industry?.slice(0, 100) ?? null,
          description: exp.description?.slice(0, 4000) ?? null,
          responsibilities: exp.responsibilities.slice(0, 20),
          achievements: exp.achievements.slice(0, 20),
          technologies: canonicaliseList(exp.technologies).slice(0, 40),
          source: provenanceKey,
          sortOrder: index,
        };
      });

    if (rows.length > 0) {
      await prisma.experience.createMany({ data: rows });
    }
  }
}
