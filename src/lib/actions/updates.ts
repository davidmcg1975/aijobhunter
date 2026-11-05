"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { queueUpdate, readUpdateStatus, updateRequest } from "@/lib/updates";
import type { AdminState } from "./admin";

export async function requestUpdateAction(_previous: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  const request = updateRequest.safeParse(Object.fromEntries(form));
  const status = await readUpdateStatus();
  if (!request.success || !status) return { error: "The update helper is unavailable." };
  if (status.phase === "installing" || status.phase === "checking") {
    return { error: "An update operation is already running." };
  }
  if (request.data.command === "install" &&
      (status.phase !== "available" || status.revision !== request.data.revision)) {
    return { error: "Check for updates again before installing." };
  }
  try {
    await queueUpdate(request.data);
  } catch {
    return { error: "Could not queue the request. Check the helper and try again." };
  }
  revalidatePath("/admin");
  return { success: "Request sent. Refresh the status in a moment." };
}
