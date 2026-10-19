import type { MatchBreakdown } from "./types";

/**
 * Whether a score is worth showing as a percentage at all.
 *
 * Dimensions that cannot be assessed have their weight redistributed, so a
 * job assessed on one 20%-weight dimension still produces a confident-looking
 * number: "Postal Delivery Driver - 60% match", scored entirely on length of
 * experience, with skills, responsibilities, industry, seniority, rate and
 * location all unassessed.
 *
 * Across 392 real matches the split was clean. Below half the weight
 * assessed, scores bunched in a meaningless 48-60 band; at half or more they
 * spread across 12-94 and discriminated properly. Half the weight is also
 * exactly where technical skills (30%) have been assessed, which is the thing
 * that makes a role a match at all.
 *
 * So below that, the honest answer is "not enough to score" rather than a
 * number - and the user is told how to fix it, which is to analyse the advert
 * or paste its full text.
 */
export const MIN_ASSESSED_WEIGHT = 50;

export type ScoreConfidence = {
  /** True when too little could be assessed for a percentage to mean anything. */
  underEvidenced: boolean;
  assessedWeight: number;
};

export function scoreConfidence(
  breakdown: Pick<MatchBreakdown, "effectiveWeightTotal">,
): ScoreConfidence {
  const assessedWeight = breakdown.effectiveWeightTotal;
  return { underEvidenced: assessedWeight < MIN_ASSESSED_WEIGHT, assessedWeight };
}

export function isUnderEvidenced(
  breakdown: Pick<MatchBreakdown, "effectiveWeightTotal"> | null | undefined,
): boolean {
  return breakdown ? scoreConfidence(breakdown).underEvidenced : false;
}

/**
 * Sorting key: under-evidenced jobs rank below every real score, however high
 * their arithmetic came out, rather than filling the top of the list.
 */
export function matchRank(
  breakdown: Pick<MatchBreakdown, "effectiveWeightTotal" | "score"> | null | undefined,
): number {
  if (!breakdown) return -2;
  return isUnderEvidenced(breakdown) ? -1 : breakdown.score;
}

export const UNDER_EVIDENCED_REASON =
  "Too little of this advert could be checked against your profile for a score to mean anything - " +
  "the skills, responsibilities and other requirements were not stated in a way we could read. " +
  "Analyse it with AI, or paste the full advert, to get a real score.";
