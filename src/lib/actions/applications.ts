"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/security/audit";

export type ApplicationState = { error?: string; success?: string };

const STATUSES = [
  "SAVED",
  "CONSIDERING",
  "APPLIED",
  "RECRUITER_CONTACTED",
  "INTERVIEW",
  "OFFER",
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
  "EXPIRED",
] as const;

type Status = (typeof STATUSES)[number];

export async function updateApplicationStatusAction(
  applicationId: string,
  status: string,
): Promise<ApplicationState> {
  const user = await requireUser();

  if (!STATUSES.includes(status as Status)) {
    return { error: "Unknown status." };
  }

  const application = await prisma.application.findFirst({
    where: { id: applicationId, userId: user.id },
  });
  if (!application) return { error: "That application could not be found." };

  const next = status as Status;

  await prisma.application.update({
    where: { id: application.id },
    data: {
      status: next,
      // Applying stamps the date and sets a sensible follow-up, which is what
      // the reminders on the dashboard read.
      appliedAt:
        next === "APPLIED" && !application.appliedAt
          ? new Date()
          : application.appliedAt,
      nextFollowUpAt:
        next === "APPLIED"
          ? new Date(Date.now() + 7 * 86_400_000)
          : ["REJECTED", "WITHDRAWN", "ACCEPTED", "EXPIRED"].includes(next)
            ? null
            : application.nextFollowUpAt,
    },
  });

  await prisma.applicationEvent.create({
    data: {
      applicationId: application.id,
      userId: user.id,
      kind: "status_changed",
      detail: `${application.status} to ${next}`,
    },
  });

  await audit({
    action: "application.status_changed",
    userId: user.id,
    entity: "Application",
    entityId: application.id,
    metadata: { from: application.status, to: next },
  });

  revalidatePath("/applications");
  revalidatePath("/dashboard");

  return { success: "Status updated." };
}

const detailSchema = z.object({
  recruiterName: z.string().trim().max(200).optional(),
  recruiterEmail: z.string().trim().max(255).optional(),
  recruiterPhone: z.string().trim().max(50).optional(),
  agency: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(10_000).optional(),
});

export async function updateApplicationAction(
  _previous: ApplicationState,
  formData: FormData,
): Promise<ApplicationState> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  const application = await prisma.application.findFirst({
    where: { id, userId: user.id },
  });
  if (!application) return { error: "That application could not be found." };

  const parsed = detailSchema.safeParse({
    recruiterName: formData.get("recruiterName") || undefined,
    recruiterEmail: formData.get("recruiterEmail") || undefined,
    recruiterPhone: formData.get("recruiterPhone") || undefined,
    agency: formData.get("agency") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: "Check the details and try again." };

  const email = parsed.data.recruiterEmail;
  if (email && !z.string().email().safeParse(email).success) {
    return { error: "That recruiter email address is not valid." };
  }

  const rateRaw = String(formData.get("agreedRate") ?? "");
  const rate = rateRaw ? Number(rateRaw) : null;
  if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 5000)) {
    return { error: "That rate is not valid." };
  }

  const followUpRaw = String(formData.get("nextFollowUpAt") ?? "");
  const followUp = followUpRaw ? new Date(followUpRaw) : null;
  if (followUp && Number.isNaN(followUp.getTime())) {
    return { error: "That follow-up date is not valid." };
  }

  const ir35 = String(formData.get("ir35") ?? "UNKNOWN");

  await prisma.application.update({
    where: { id: application.id },
    data: {
      recruiterName: parsed.data.recruiterName ?? null,
      recruiterEmail: email ?? null,
      recruiterPhone: parsed.data.recruiterPhone ?? null,
      agency: parsed.data.agency ?? null,
      notes: parsed.data.notes ?? null,
      agreedRate: rate === null ? null : Math.round(rate),
      nextFollowUpAt: followUp,
      ir35: ["INSIDE", "OUTSIDE", "UNKNOWN"].includes(ir35)
        ? (ir35 as "INSIDE" | "OUTSIDE" | "UNKNOWN")
        : "UNKNOWN",
      cvId: String(formData.get("cvId") ?? "") || null,
    },
  });

  revalidatePath("/applications");
  return { success: "Application updated." };
}

export async function deleteApplicationAction(
  applicationId: string,
): Promise<ApplicationState> {
  const user = await requireUser();

  const deleted = await prisma.application.deleteMany({
    where: { id: applicationId, userId: user.id },
  });
  if (deleted.count === 0) return { error: "That application could not be found." };

  await audit({
    action: "application.deleted",
    userId: user.id,
    entity: "Application",
    entityId: applicationId,
  });

  revalidatePath("/applications");
  return { success: "Application removed." };
}
