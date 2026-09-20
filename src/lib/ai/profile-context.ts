import "server-only";
import { prisma } from "@/lib/db";
import type { MatchProfile } from "@/lib/matching/engine";
import type { GroundingSource } from "./grounding";

/**
 * Assembles the verified picture of a user: structured profile, employment
 * history and master CV text.
 *
 * Every AI writing operation and every match is built from this, and it is
 * always loaded by userId - there is no code path that can assemble one user's
 * context from another user's rows.
 */

export type UserContext = {
  profile: MatchProfile;
  grounding: GroundingSource;
  /** Rendered for the prompt. */
  summary: string;
  masterCvText: string;
  hasProfile: boolean;
  hasMasterCv: boolean;
  /** Changes whenever the profile or CV changes, so matches can go stale. */
  version: string;
};

export async function loadUserContext(userId: string): Promise<UserContext> {
  const [profile, experiences, masterCv] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.experience.findMany({
      where: { userId },
      // Undated roles sort last rather than to the top.
      orderBy: [{ startDate: { sort: "desc", nulls: "last" } }],
    }),
    prisma.cv.findFirst({
      where: { userId, isMaster: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const masterCvText = masterCv?.extractedText ?? "";

  const matchProfile: MatchProfile = {
    jobTitles: profile?.jobTitles ?? [],
    yearsExperience: profile?.yearsExperience ?? null,
    industries: profile?.industries ?? [],
    technologies: profile?.technologies ?? [],
    testingMethodologies: profile?.testingMethodologies ?? [],
    aiTestingSkills: profile?.aiTestingSkills ?? [],
    certifications: profile?.certifications ?? [],
    managementExperience: profile?.managementExperience ?? null,
    minDayRate: profile?.minDayRate ?? null,
    preferredDayRate: profile?.preferredDayRate ?? null,
    maxCommuteMiles: profile?.maxCommuteMiles ?? null,
    remoteModes: profile?.remoteModes ?? [],
    ir35Stances: profile?.ir35Stances ?? [],
    location: profile?.location ?? null,
    experiences: experiences.map((exp) => ({
      company: exp.company,
      jobTitle: exp.jobTitle,
      startDate: exp.startDate,
      endDate: exp.endDate,
      industry: exp.industry,
      responsibilities: exp.responsibilities,
      technologies: exp.technologies,
      description: exp.description,
    })),
    cvText: masterCvText,
  };

  const grounding: GroundingSource = {
    text: [
      masterCvText,
      profile?.technologies.join(", ") ?? "",
      profile?.testingMethodologies.join(", ") ?? "",
      profile?.aiTestingSkills.join(", ") ?? "",
      profile?.certifications.join(", ") ?? "",
      profile?.qualifications.join(", ") ?? "",
      profile?.managementExperience ?? "",
      experiences
        .map((e) =>
          [
            e.company,
            e.jobTitle,
            e.startDate?.getUTCFullYear() ?? "",
            e.endDate?.getUTCFullYear() ?? "",
            e.description ?? "",
            e.responsibilities.join(" "),
            e.achievements.join(" "),
            e.technologies.join(" "),
          ].join(" "),
        )
        .join("\n"),
    ].join("\n"),
    employers: experiences.map((e) => e.company),
    qualifications: [
      ...(profile?.qualifications ?? []),
      ...(profile?.certifications ?? []),
    ],
  };

  return {
    profile: matchProfile,
    grounding,
    summary: renderSummary(profile, experiences),
    masterCvText,
    hasProfile: Boolean(profile),
    hasMasterCv: Boolean(masterCv?.extractedText),
    version: [
      profile?.updatedAt?.getTime() ?? 0,
      masterCv?.updatedAt?.getTime() ?? 0,
      experiences.length,
      experiences[0]?.updatedAt?.getTime() ?? 0,
    ].join("-"),
  };
}

type ProfileRow = Awaited<ReturnType<typeof prisma.profile.findUnique>>;
type ExperienceRow = Awaited<ReturnType<typeof prisma.experience.findMany>>;

function renderSummary(profile: ProfileRow, experiences: ExperienceRow): string {
  if (!profile && experiences.length === 0) {
    return "No structured profile has been completed yet.";
  }

  const lines: string[] = [];
  const list = (label: string, values: string[] | undefined) => {
    if (values && values.length > 0) lines.push(`${label}: ${values.join(", ")}`);
  };

  if (profile?.headline) lines.push(`Headline: ${profile.headline}`);
  if (profile?.location) lines.push(`Location: ${profile.location}`);
  if (profile?.yearsExperience) {
    lines.push(`Years of experience: ${profile.yearsExperience}`);
  }
  list("Job titles held", profile?.jobTitles);
  list("Industries", profile?.industries);
  list("Technologies", profile?.technologies);
  list("Testing methodologies", profile?.testingMethodologies);
  list("AI/LLM testing skills", profile?.aiTestingSkills);
  list("Certifications", profile?.certifications);
  list("Qualifications", profile?.qualifications);
  if (profile?.managementExperience) {
    lines.push(`Management experience: ${profile.managementExperience}`);
  }

  if (experiences.length > 0) {
    lines.push("", "EMPLOYMENT HISTORY:");
    for (const exp of experiences) {
      const start = exp.startDate?.toISOString().slice(0, 7) ?? "date not stated";
      const end = exp.isCurrent
        ? "present"
        : (exp.endDate?.toISOString().slice(0, 7) ?? "not stated");
      lines.push(`- ${exp.jobTitle}, ${exp.company} (${start} to ${end})`);
      if (exp.industry) lines.push(`  Industry: ${exp.industry}`);
      if (exp.technologies.length) {
        lines.push(`  Technologies: ${exp.technologies.join(", ")}`);
      }
      for (const r of exp.responsibilities.slice(0, 8)) lines.push(`  - ${r}`);
      for (const a of exp.achievements.slice(0, 5)) lines.push(`  * ${a}`);
    }
  }

  return lines.join("\n");
}
