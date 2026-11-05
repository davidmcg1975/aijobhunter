import "server-only";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

export const updateRequest = z.discriminatedUnion("command", [
  z.object({ command: z.literal("check") }),
  z.object({ command: z.literal("enable") }),
  z.object({ command: z.literal("disable") }),
  z.object({ command: z.literal("install"), revision: z.string().regex(/^[a-f0-9]{40}$/) }),
]);

const updateStatus = z.object({
  phase: z.enum(["idle", "checking", "current", "available", "installing", "installed", "error"]),
  automatic: z.boolean(),
  revision: z.string().regex(/^[a-f0-9]{40}$/).optional(),
  updatedAt: z.number(),
});

export async function readUpdateStatus() {
  const directory = process.env.UPDATE_MAILBOX;
  if (!directory) return null;

  try {
    const status = updateStatus.parse(JSON.parse(await readFile(join(directory, "status.json"), "utf8")));
    const active = status.phase === "checking" || status.phase === "installing";
    return Date.now() - status.updatedAt < (active ? 3_600_000 : 15_000) ? status : null;
  } catch {
    return null;
  }
}

export async function queueUpdate(request: z.infer<typeof updateRequest>) {
  const directory = process.env.UPDATE_MAILBOX;
  if (!directory) throw new Error("Updates are disabled.");
  await writeFile(join(directory, "request.json"), JSON.stringify(request), { flag: "wx" });
}
