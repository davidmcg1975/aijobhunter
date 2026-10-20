import type { Prisma } from "@prisma/client";

/**
 * Who may see which job.
 *
 * Provider listings are shared reference data and carry no owner. A job a
 * user added by hand is different: it may have come from a recruiter's email
 * or a private portal, so it belongs to them alone.
 *
 * Every query that reaches a job on a user's behalf must spread one of these
 * into its `where`, including by-id lookups - the same rule as any
 * user-owned table, just expressed on a mixed one.
 */

/** Shared jobs plus this user's own. */
export function visibleToUser(userId: string): Prisma.JobWhereInput {
  return { OR: [{ addedByUserId: null }, { addedByUserId: userId }] };
}

/**
 * Shared jobs only. For background work with no user behind it - scheduled
 * fetching, and deduplication, which must never point a shared listing at
 * someone's private copy.
 */
export const sharedOnly: Prisma.JobWhereInput = { addedByUserId: null };

/** For a by-id lookup: `findFirst({ where: ownedJob(id, userId) })`. */
export function ownedJob(id: string, userId: string): Prisma.JobWhereInput {
  return { id, ...visibleToUser(userId) };
}
