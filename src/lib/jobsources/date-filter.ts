import type { Prisma } from "@prisma/client";

export function jobDateFilter(days: string | undefined, now = Date.now()): Prisma.JobWhereInput {
  if (days === "all") return {};

  const requested = Number(days);
  const window = Number.isInteger(requested) && requested >= 1 && requested <= 60 ? requested : 1;
  const cutoff = new Date(now - window * 86_400_000);
  return {
    OR: [
      { postedAt: { gte: cutoff } },
      { postedAt: null, retrievedAt: { gte: cutoff } },
    ],
  };
}
