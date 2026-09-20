import { createHash } from "node:crypto";
import type { NormalisedJob } from "./types";

/**
 * Agencies repost the same contract repeatedly, and once several sources are
 * live the same role arrives from each of them. Deduplication runs in two
 * stages: a cheap fingerprint to find candidates, then a similarity check to
 * confirm, because two genuinely different roles can share a title and city.
 */

/** Words that carry no distinguishing signal in a UK contract job title. */
const TITLE_NOISE = new Set([
  "contract",
  "contractor",
  "urgent",
  "immediate",
  "start",
  "asap",
  "new",
  "role",
  "job",
  "vacancy",
  "opportunity",
  "hybrid",
  "remote",
  "onsite",
  "ir35",
  "inside",
  "outside",
  "month",
  "months",
  "day",
  "rate",
  "per",
  "uk",
]);

const COMPANY_SUFFIX =
  /\b(ltd|limited|plc|llp|group|recruitment|resourcing|consulting|consultancy|solutions|services|technologies|technology|international|uk)\b/g;

export function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !TITLE_NOISE.has(w) && !/^\d+$/.test(w))
    .sort()
    .join(" ")
    .trim();
}

export function normaliseCompany(company: string | null): string {
  if (!company) return "";
  return company
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(COMPANY_SUFFIX, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .trim();
}

/** Reduce "London, South East England" to its most specific part. */
export function normaliseLocation(location: string | null): string {
  if (!location) return "";
  const first = location.split(",")[0] ?? "";
  return first.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
}

/**
 * Fingerprint used as the candidate key. Company is deliberately included:
 * two "Test Analyst / London" roles at different clients are different jobs.
 */
export function fingerprint(job: {
  title: string;
  company: string | null;
  location: string | null;
}): string {
  const parts = [
    normaliseTitle(job.title),
    normaliseCompany(job.company),
    normaliseLocation(job.location),
  ].join("|");
  return createHash("sha256").update(parts).digest("hex").slice(0, 32);
}

/** Word-level Jaccard similarity, 0..1. */
export function similarity(a: string, b: string): number {
  const tokenise = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );

  const setA = tokenise(a);
  const setB = tokenise(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) if (setB.has(word)) intersection += 1;

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Above this, two adverts with the same fingerprint are the same job. */
export const DUPLICATE_THRESHOLD = 0.7;

export type DuplicateCandidate = {
  id: string;
  source: string;
  sourceJobId: string;
  description: string;
  url: string;
};

/**
 * Returns the id of an existing job this one duplicates, or null.
 * The same job from the same source is matched on the source id upstream;
 * this handles cross-source and cross-posting duplicates.
 */
export function findDuplicate(
  incoming: Pick<NormalisedJob, "description" | "source" | "sourceJobId">,
  candidates: DuplicateCandidate[],
): string | null {
  for (const candidate of candidates) {
    if (
      candidate.source === incoming.source &&
      candidate.sourceJobId === incoming.sourceJobId
    ) {
      return candidate.id;
    }
    if (similarity(incoming.description, candidate.description) >= DUPLICATE_THRESHOLD) {
      return candidate.id;
    }
  }
  return null;
}
