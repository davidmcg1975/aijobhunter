"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, destroyAllSessions, destroySession } from "@/lib/auth/session";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/auth/password";
import { audit } from "@/lib/security/audit";
import { deleteFile } from "@/lib/storage";
import { issueToken } from "@/lib/auth/tokens";
import { sendEmail, verificationEmail } from "@/lib/email";
import { env } from "@/lib/env";

export type AccountState = { error?: string; success?: string };

export async function changePasswordAction(
  _previous: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const sessionUser = await requireUser();

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");

  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) return { error: "Account not found." };

  if (!(await verifyPassword(current, user.passwordHash))) {
    return { error: "Your current password is not correct." };
  }

  const problems = validatePassword(next);
  if (problems.length > 0) return { error: problems[0] };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next) },
  });

  // Every other device is signed out; this one keeps its session.
  await destroyAllSessions(user.id);
  await audit({ action: "user.password_changed", userId: user.id });

  return {
    success:
      "Password changed. You have been signed out everywhere else - sign in again on this device if prompted.",
  };
}

export async function resendVerificationAction(): Promise<AccountState> {
  const user = await requireUser();
  if (user.emailVerified) return { success: "Your email is already confirmed." };

  const token = await issueToken(user.id, "EMAIL_VERIFICATION");
  const link = `${env().APP_URL}/verify-email?token=${token}`;
  await sendEmail({ to: user.email, ...verificationEmail(user.name, link) });

  return { success: "A new confirmation link is on its way." };
}

/**
 * UK GDPR article 20 - everything held about the user, in a portable format.
 * Assembled fresh rather than from a cache so it is genuinely current.
 */
export async function exportDataAction(): Promise<{ data: string }> {
  const user = await requireUser();

  const [account, profile, experiences, cvs, applications, saved, letters, searches] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          emailVerified: true,
          acceptedTermsAt: true,
          aiProcessingConsentAt: true,
        },
      }),
      prisma.profile.findUnique({ where: { userId: user.id } }),
      prisma.experience.findMany({ where: { userId: user.id } }),
      prisma.cv.findMany({ where: { userId: user.id } }),
      prisma.application.findMany({
        where: { userId: user.id },
        include: { events: true, interviews: true, job: true },
      }),
      prisma.savedJob.findMany({ where: { userId: user.id }, include: { job: true } }),
      prisma.coverLetter.findMany({ where: { userId: user.id } }),
      prisma.savedSearch.findMany({ where: { userId: user.id } }),
    ]);

  await audit({ action: "user.data_exported", userId: user.id });

  return {
    data: JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        account,
        profile,
        experiences,
        cvs,
        applications,
        savedJobs: saved,
        coverLetters: letters,
        savedSearches: searches,
      },
      null,
      2,
    ),
  };
}

/**
 * UK GDPR article 17. Deletes the account and everything hanging off it.
 * Cascades handle the database; stored CV files are removed explicitly first
 * because object storage is outside the transaction.
 */
export async function deleteAccountAction(
  _previous: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const sessionUser = await requireUser();

  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (confirmation !== "DELETE") {
    return { error: 'Type DELETE in the confirmation box to continue.' };
  }

  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) return { error: "Account not found." };

  if (!(await verifyPassword(password, user.passwordHash))) {
    return { error: "That password is not correct." };
  }

  const cvs = await prisma.cv.findMany({
    where: { userId: user.id, fileKey: { not: null } },
    select: { fileKey: true },
  });
  for (const cv of cvs) {
    if (cv.fileKey) await deleteFile(user.id, cv.fileKey);
  }

  await audit({
    action: "user.deleted",
    userId: null,
    actorId: user.id,
    metadata: { deletedUserId: user.id },
  });

  await prisma.user.delete({ where: { id: user.id } });
  await destroySession();

  redirect("/login?deleted=1");
}
