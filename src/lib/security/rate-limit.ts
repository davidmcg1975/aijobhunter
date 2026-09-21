import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";

export type RateLimitRule = {
  /** Window length in seconds. */
  windowSeconds: number;
  /** Maximum number of hits allowed in a window. */
  max: number;
};

/**
 * Database-backed so the limit holds across serverless instances, where an
 * in-memory counter would reset on every cold start.
 */
export const RULES = {
  login: { windowSeconds: 900, max: 10 },
  register: { windowSeconds: 3600, max: 5 },
  passwordReset: { windowSeconds: 3600, max: 5 },
  cvUpload: { windowSeconds: 3600, max: 20 },
  aiOperation: { windowSeconds: 3600, max: 60 },
  jobSearch: { windowSeconds: 60, max: 30 },
  credentials: { windowSeconds: 3600, max: 30 },
} as const satisfies Record<string, RateLimitRule>;

export type RuleName = keyof typeof RULES;

export class RateLimitedError extends Error {
  constructor(public retryAfterSeconds: number) {
    super("Too many requests");
    this.name = "RateLimitedError";
  }
}

export async function clientIp(): Promise<string> {
  const hdrs = await headers();
  const forwarded = hdrs.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return hdrs.get("x-real-ip") ?? "unknown";
}

/**
 * Fixed-window counter. Coarser than a sliding window but cheap, and adequate
 * for the abuse we actually care about (credential stuffing, AI cost burn).
 */
export async function checkRateLimit(
  rule: RuleName,
  key: string,
): Promise<void> {
  const { windowSeconds, max } = RULES[rule];
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const expiresAt = new Date(windowStart.getTime() + windowMs);

  const record = await prisma.rateLimit.upsert({
    where: {
      bucket_key_windowStart: { bucket: rule, key, windowStart },
    },
    create: { bucket: rule, key, windowStart, expiresAt, count: 1 },
    update: { count: { increment: 1 } },
  });

  if (record.count > max) {
    const retryAfter = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);
    throw new RateLimitedError(Math.max(retryAfter, 1));
  }
}

/** Housekeeping, called from the daily cron. */
export async function purgeExpiredRateLimits(): Promise<number> {
  const { count } = await prisma.rateLimit.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
