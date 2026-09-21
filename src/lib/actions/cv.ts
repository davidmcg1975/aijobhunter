"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/security/audit";
import { RateLimitedError, checkRateLimit } from "@/lib/security/rate-limit";
import { CvExtractionError, MAX_CV_BYTES, extractCvText } from "@/lib/cv/extract";
import { deleteFile, putFile } from "@/lib/storage";
import { AiUnavailableError } from "@/lib/ai/client";
import {
  applyExtractionToProfile,
  extractCvStructure,
  type ExtractedCv,
} from "@/lib/ai/cv-extraction";
import { aiAvailableFor } from "@/lib/ai/credentials";

export type CvUploadState = {
  error?: string;
  success?: string;
  cvId?: string;
  extraction?: ExtractedCv;
};

/**
 * Upload -> validate -> store -> extract text -> AI structure.
 *
 * The AI structuring is offered as a suggestion: it is saved against the CV
 * and shown to the user, and only becomes profile data when they confirm it.
 */
export async function uploadCvAction(
  _previous: CvUploadState,
  formData: FormData,
): Promise<CvUploadState> {
  const user = await requireUser();

  try {
    await checkRateLimit("cvUpload", user.id);
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return { error: "Too many uploads recently. Try again later." };
    }
    throw error;
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CV file to upload." };
  }
  if (file.size > MAX_CV_BYTES) {
    return { error: "That file is larger than 10 MB." };
  }

  const makeMaster = formData.get("isMaster") === "on";
  const name = String(formData.get("name") ?? "").trim() || file.name;

  const data = Buffer.from(await file.arrayBuffer());

  let text: string;
  try {
    ({ text } = await extractCvText(data, file.name));
  } catch (error) {
    if (error instanceof CvExtractionError) return { error: error.message };
    throw error;
  }

  const stored = await putFile(user.id, file.name, data);

  // Only one master CV at a time, and it is never overwritten by tailoring.
  if (makeMaster) {
    await prisma.cv.updateMany({
      where: { userId: user.id, isMaster: true },
      data: { isMaster: false, kind: "TAILORED" },
    });
  }

  const cv = await prisma.cv.create({
    data: {
      userId: user.id,
      name: name.slice(0, 150),
      kind: makeMaster ? "MASTER" : "TAILORED",
      isMaster: makeMaster,
      fileKey: stored.key,
      fileName: file.name.slice(0, 255),
      fileMimeType: file.type.slice(0, 100),
      fileSize: stored.size,
      extractedText: text,
    },
  });

  await audit({
    action: "cv.uploaded",
    userId: user.id,
    entity: "Cv",
    entityId: cv.id,
    // Deliberately records that a CV arrived, never any of its content.
    metadata: { bytes: stored.size, isMaster: makeMaster },
  });

  revalidatePath("/cv");

  if (!(await aiAvailableFor(user.id))) {
    return {
      cvId: cv.id,
      success:
        "CV uploaded and text extracted. AI structuring is not set up - choose an AI provider and add its API key under Settings, or fill in your profile by hand.",
    };
  }

  try {
    const extraction = await extractCvStructure({
      cvId: cv.id,
      userId: user.id,
      text,
    });
    return {
      cvId: cv.id,
      extraction,
      success: "CV uploaded and read. Check what was found before adding it to your profile.",
    };
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      return { cvId: cv.id, success: `CV uploaded. ${error.message}` };
    }
    console.error("[cv] structuring failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return {
      cvId: cv.id,
      success:
        "CV uploaded, but the AI could not structure it. You can still fill in your profile by hand.",
    };
  }
}

export async function confirmExtractionAction(
  _previous: { error?: string; success?: string },
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const user = await requireUser();
  const cvId = String(formData.get("cvId") ?? "");
  const replaceExperience = formData.get("replaceExperience") === "on";

  const cv = await prisma.cv.findFirst({ where: { id: cvId, userId: user.id } });
  if (!cv?.structured) {
    return { error: "That extraction could not be found." };
  }

  await applyExtractionToProfile({
    userId: user.id,
    cvId: cv.id,
    extraction: cv.structured as unknown as ExtractedCv,
    replaceExperience,
  });

  await audit({
    action: "profile.updated",
    userId: user.id,
    metadata: { from: "cv_extraction", cvId: cv.id },
  });

  revalidatePath("/profile");
  revalidatePath("/cv");

  return { success: "Your profile has been updated from your CV." };
}

export async function setMasterCvAction(cvId: string): Promise<{ error?: string }> {
  const user = await requireUser();

  const cv = await prisma.cv.findFirst({ where: { id: cvId, userId: user.id } });
  if (!cv) return { error: "That CV could not be found." };

  await prisma.$transaction([
    prisma.cv.updateMany({
      where: { userId: user.id, isMaster: true },
      data: { isMaster: false, kind: "TAILORED" },
    }),
    prisma.cv.update({
      where: { id: cv.id },
      data: { isMaster: true, kind: "MASTER" },
    }),
  ]);

  revalidatePath("/cv");
  return {};
}

export async function deleteCvAction(cvId: string): Promise<{ error?: string }> {
  const user = await requireUser();

  const cv = await prisma.cv.findFirst({ where: { id: cvId, userId: user.id } });
  if (!cv) return { error: "That CV could not be found." };

  if (cv.fileKey) await deleteFile(user.id, cv.fileKey);
  await prisma.cv.delete({ where: { id: cv.id } });

  await audit({
    action: "cv.deleted",
    userId: user.id,
    entity: "Cv",
    entityId: cv.id,
  });

  revalidatePath("/cv");
  return {};
}
