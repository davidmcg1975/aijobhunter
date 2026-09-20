"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/security/audit";
import { deleteFile } from "@/lib/storage";

export type AdminState = { error?: string; success?: string };

export async function setUserDisabledAction(
  userId: string,
  disabled: boolean,
): Promise<AdminState> {
  const admin = await requireAdmin();

  if (userId === admin.id) {
    return { error: "You cannot disable your own account." };
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "That user could not be found." };

  await prisma.user.update({
    where: { id: userId },
    data: { disabledAt: disabled ? new Date() : null },
  });

  // A disabled account must not keep working until its session expires.
  if (disabled) {
    await prisma.session.deleteMany({ where: { userId } });
  }

  await audit({
    action: disabled ? "admin.user_disabled" : "admin.user_enabled",
    userId,
    actorId: admin.id,
  });

  revalidatePath("/admin");
  return { success: disabled ? "Account disabled." : "Account enabled." };
}

export async function deleteUserAction(userId: string): Promise<AdminState> {
  const admin = await requireAdmin();

  if (userId === admin.id) {
    return { error: "Delete your own account from Settings instead." };
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "That user could not be found." };

  const cvs = await prisma.cv.findMany({
    where: { userId, fileKey: { not: null } },
    select: { fileKey: true },
  });
  for (const cv of cvs) {
    if (cv.fileKey) await deleteFile(userId, cv.fileKey);
  }

  await audit({
    action: "admin.user_deleted",
    actorId: admin.id,
    metadata: { deletedUserId: userId },
  });

  await prisma.user.delete({ where: { id: userId } });

  revalidatePath("/admin");
  return { success: "Account and all associated data deleted." };
}
