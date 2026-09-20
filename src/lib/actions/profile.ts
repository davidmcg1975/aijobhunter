"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/security/audit";
import { canonicaliseList } from "@/lib/matching/skills";

export type ProfileState = { error?: string; success?: string };

/** Comma or newline separated free text into a clean list. */
function toList(value: FormDataEntryValue | null, max = 60): string[] {
  if (typeof value !== "string") return [];
  const seen = new Map<string, string>();
  for (const raw of value.split(/[,\n]/)) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > 100) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return [...seen.values()].slice(0, max);
}

function toInt(value: FormDataEntryValue | null, min: number, max: number) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

const textSchema = z.string().trim().max(300).optional();

export async function saveProfileAction(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await requireUser();

  const headline = textSchema.safeParse(formData.get("headline") ?? undefined);
  if (!headline.success) return { error: "Headline is too long." };

  const remoteModes = formData
    .getAll("remoteModes")
    .filter((v): v is string => typeof v === "string")
    .filter((v) => ["REMOTE", "HYBRID", "ONSITE"].includes(v));

  const ir35Stances = formData
    .getAll("ir35Stances")
    .filter((v): v is string => typeof v === "string")
    .filter((v) => ["INSIDE", "OUTSIDE"].includes(v));

  const engagementModels = formData
    .getAll("engagementModels")
    .filter((v): v is string => typeof v === "string")
    .filter((v) => ["UMBRELLA", "LIMITED_COMPANY", "PAYE"].includes(v));

  const minDayRate = toInt(formData.get("minDayRate"), 0, 5000);
  const preferredDayRate = toInt(formData.get("preferredDayRate"), 0, 5000);

  if (minDayRate !== null && preferredDayRate !== null && preferredDayRate < minDayRate) {
    return { error: "Your target rate cannot be lower than your minimum rate." };
  }

  const data = {
    headline: String(formData.get("headline") ?? "").trim().slice(0, 300) || null,
    location: String(formData.get("location") ?? "").trim().slice(0, 200) || null,
    postcode: String(formData.get("postcode") ?? "").trim().slice(0, 20) || null,
    phone: String(formData.get("phone") ?? "").trim().slice(0, 40) || null,
    linkedinUrl: String(formData.get("linkedinUrl") ?? "").trim().slice(0, 300) || null,

    minDayRate,
    preferredDayRate,
    maxCommuteMiles: toInt(formData.get("maxCommuteMiles"), 0, 500),
    minContractMonths: toInt(formData.get("minContractMonths"), 0, 60),
    maxContractMonths: toInt(formData.get("maxContractMonths"), 0, 60),
    remoteModes: remoteModes as ("REMOTE" | "HYBRID" | "ONSITE")[],
    ir35Stances: ir35Stances as ("INSIDE" | "OUTSIDE")[],
    engagementModels: engagementModels as ("UMBRELLA" | "LIMITED_COMPANY" | "PAYE")[],

    jobTitles: toList(formData.get("jobTitles")),
    yearsExperience: toInt(formData.get("yearsExperience"), 0, 70),
    industries: toList(formData.get("industries")),
    technologies: canonicaliseList(toList(formData.get("technologies"), 100)),
    testingMethodologies: canonicaliseList(toList(formData.get("testingMethodologies"))),
    aiTestingSkills: canonicaliseList(toList(formData.get("aiTestingSkills"))),
    certifications: toList(formData.get("certifications")),
    qualifications: toList(formData.get("qualifications")),
    softSkills: toList(formData.get("softSkills")),
    managementExperience:
      String(formData.get("managementExperience") ?? "").trim().slice(0, 2000) || null,
  };

  await prisma.profile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });

  await audit({ action: "profile.updated", userId: user.id });

  revalidatePath("/profile");
  revalidatePath("/dashboard");

  return {
    success:
      "Profile saved. Re-score your jobs from the Jobs page to apply the changes.",
  };
}

const experienceSchema = z.object({
  company: z.string().trim().min(1, "Enter the company name").max(200),
  jobTitle: z.string().trim().min(1, "Enter the job title").max(200),
  startDate: z.string().optional(),
});

export async function saveExperienceAction(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  const parsed = experienceSchema.safeParse({
    company: formData.get("company"),
    jobTitle: formData.get("jobTitle"),
    startDate: formData.get("startDate"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const startRaw = parsed.data.startDate ?? "";
  const startDate = startRaw ? new Date(startRaw) : null;
  if (startDate && Number.isNaN(startDate.getTime())) {
    return { error: "That start date is not valid." };
  }

  const isCurrent = formData.get("isCurrent") === "on";
  const endDateRaw = String(formData.get("endDate") ?? "");
  const endDate = isCurrent || !endDateRaw ? null : new Date(endDateRaw);

  if (endDate && Number.isNaN(endDate.getTime())) {
    return { error: "That end date is not valid." };
  }
  if (endDate && startDate && endDate < startDate) {
    return { error: "The end date cannot be before the start date." };
  }

  const data = {
    company: parsed.data.company,
    jobTitle: parsed.data.jobTitle,
    startDate,
    endDate,
    isCurrent,
    location: String(formData.get("location") ?? "").trim().slice(0, 200) || null,
    industry: String(formData.get("industry") ?? "").trim().slice(0, 100) || null,
    description: String(formData.get("description") ?? "").trim().slice(0, 4000) || null,
    responsibilities: toList(formData.get("responsibilities"), 25),
    achievements: toList(formData.get("achievements"), 25),
    technologies: canonicaliseList(toList(formData.get("technologies"), 50)),
  };

  if (id) {
    // Scoped by userId so an id from another account updates nothing.
    const updated = await prisma.experience.updateMany({
      where: { id, userId: user.id },
      data,
    });
    if (updated.count === 0) return { error: "That role could not be found." };
  } else {
    await prisma.experience.create({
      data: { ...data, userId: user.id, source: "user" },
    });
  }

  await audit({ action: "profile.updated", userId: user.id, entity: "Experience" });
  revalidatePath("/profile");

  return { success: "Role saved." };
}

export async function deleteExperienceAction(id: string): Promise<ProfileState> {
  const user = await requireUser();
  const deleted = await prisma.experience.deleteMany({
    where: { id, userId: user.id },
  });
  if (deleted.count === 0) return { error: "That role could not be found." };

  revalidatePath("/profile");
  return { success: "Role removed." };
}
