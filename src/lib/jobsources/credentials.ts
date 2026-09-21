import "server-only";
import { getUserCredentials } from "@/lib/credentials/store";
import type { Credentials } from "@/lib/credentials/fields";
import { allSources } from "./registry";
import type { JobSource } from "./types";

export type KeyOwner = "user" | "installation";

export type ResolvedSource = {
  source: JobSource;
  credentials: Credentials;
  keyOwner: KeyOwner;
};

/**
 * Which credentials a search runs with: the user's own when they have saved
 * them, otherwise the installation's from the environment. A user's key is
 * never used on anyone else's behalf - background jobs pass no userId and get
 * the installation's only.
 */
export async function resolveSource(
  source: JobSource,
  userId?: string | null,
): Promise<ResolvedSource | null> {
  if (userId) {
    const own = await getUserCredentials(userId, source.id);
    if (own && source.credentialFields.every((f) => own[f.name])) {
      return { source, credentials: own, keyOwner: "user" };
    }
  }
  const installation = source.environmentCredentials();
  return installation ? { source, credentials: installation, keyOwner: "installation" } : null;
}

/** Every source this user can search right now, with the key it would use. */
export async function availableSources(userId?: string | null): Promise<ResolvedSource[]> {
  const resolved = await Promise.all(allSources().map((s) => resolveSource(s, userId)));
  return resolved.filter((r): r is ResolvedSource => r !== null);
}

export type SourceAvailability = {
  id: string;
  displayName: string;
  configured: boolean;
  keyOwner: KeyOwner | null;
};

export async function sourceStatusFor(userId: string): Promise<SourceAvailability[]> {
  return Promise.all(
    allSources().map(async (source) => {
      const resolved = await resolveSource(source, userId);
      return {
        id: source.id,
        displayName: source.displayName,
        configured: resolved !== null,
        keyOwner: resolved?.keyOwner ?? null,
      };
    }),
  );
}
