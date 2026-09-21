import "server-only";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { decryptSecret, DecryptionError, encryptSecret } from "@/lib/security/encryption";
import type { Credentials } from "./fields";

/**
 * The only module that reads or writes ApiCredential. Decrypted values leave
 * it only towards server code that makes the outbound call; nothing here is
 * ever returned to a client component.
 */

function context(userId: string, provider: string): string {
  return `${userId}:${provider}`;
}

export async function saveUserCredentials(
  userId: string,
  provider: string,
  values: Credentials,
  hint: string,
): Promise<void> {
  const ciphertext = encryptSecret(
    JSON.stringify(values),
    env().AUTH_SECRET,
    context(userId, provider),
  );
  await prisma.apiCredential.upsert({
    where: { userId_provider: { userId, provider } },
    create: { userId, provider, ciphertext, hint },
    update: { ciphertext, hint },
  });
}

export async function deleteUserCredentials(userId: string, provider: string): Promise<void> {
  await prisma.apiCredential.deleteMany({ where: { userId, provider } });
}

/**
 * The user's own credentials for a provider, or null when they have none - or
 * when the saved value can no longer be read because AUTH_SECRET changed. The
 * caller then falls back to the installation's key; the settings page shows
 * the user that their saved key needs entering again.
 */
export async function getUserCredentials(
  userId: string,
  provider: string,
): Promise<Credentials | null> {
  const row = await prisma.apiCredential.findFirst({
    where: { userId, provider },
    select: { ciphertext: true },
  });
  if (!row) return null;
  try {
    const parsed: unknown = JSON.parse(
      decryptSecret(row.ciphertext, env().AUTH_SECRET, context(userId, provider)),
    );
    return isCredentials(parsed) ? parsed : null;
  } catch (error) {
    if (error instanceof DecryptionError || error instanceof SyntaxError) return null;
    throw error;
  }
}

export type CredentialStatus = {
  provider: string;
  hint: string;
  updatedAt: Date;
  /** Saved, but undecryptable - AUTH_SECRET has changed since. */
  unreadable: boolean;
};

/** For the settings page: what is saved, never the values themselves. */
export async function listUserCredentialStatus(userId: string): Promise<CredentialStatus[]> {
  const rows = await prisma.apiCredential.findMany({
    where: { userId },
    select: { provider: true, hint: true, updatedAt: true, ciphertext: true },
  });
  const secret = env().AUTH_SECRET;
  return rows.map((row) => {
    let unreadable = false;
    try {
      decryptSecret(row.ciphertext, secret, context(userId, row.provider));
    } catch {
      unreadable = true;
    }
    return { provider: row.provider, hint: row.hint, updatedAt: row.updatedAt, unreadable };
  });
}

function isCredentials(value: unknown): value is Credentials {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((v) => typeof v === "string")
  );
}
