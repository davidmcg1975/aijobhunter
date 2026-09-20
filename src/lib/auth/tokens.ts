import "server-only";
import { randomBytes, createHash } from "node:crypto";
import type { AuthTokenKind } from "@prisma/client";
import { prisma } from "@/lib/db";

const TTL_MS: Record<AuthTokenKind, number> = {
  EMAIL_VERIFICATION: 1000 * 60 * 60 * 24, // 24 hours
  PASSWORD_RESET: 1000 * 60 * 60, // 1 hour
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Creates a single-use token and returns the raw value, which is emailed to the
 * user and never persisted. Any earlier unused tokens of the same kind are
 * invalidated so a leaked older link cannot be used.
 */
export async function issueToken(
  userId: string,
  kind: AuthTokenKind,
): Promise<string> {
  await prisma.authToken.deleteMany({ where: { userId, kind, usedAt: null } });

  const raw = randomBytes(32).toString("base64url");
  await prisma.authToken.create({
    data: {
      userId,
      kind,
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + TTL_MS[kind]),
    },
  });
  return raw;
}

/**
 * Consumes a token atomically. Returns the userId, or null when the token is
 * unknown, expired or already used.
 */
export async function consumeToken(
  raw: string,
  kind: AuthTokenKind,
): Promise<string | null> {
  const record = await prisma.authToken.findUnique({
    where: { tokenHash: sha256(raw) },
  });

  if (!record) return null;
  if (record.kind !== kind) return null;
  if (record.usedAt) return null;
  if (record.expiresAt.getTime() < Date.now()) return null;

  // Conditional update: if two requests race, only one marks it used.
  const claimed = await prisma.authToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) return null;

  return record.userId;
}
