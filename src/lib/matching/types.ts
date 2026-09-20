/**
 * Match scoring types.
 *
 * The breakdown is stored on JobMatch.breakdown as JSON and is what the
 * "Why this score?" view renders. A score must never be shown without it.
 */

/** How well the user's evidence supports a given requirement. */
export type EvidenceLevel =
  /** Stated explicitly in the CV or structured profile. */
  | "CONFIRMED"
  /** A reasonable inference from related, genuine experience. */
  | "INFERRED"
  /** Nothing either way. NOT the same as "cannot do it". */
  | "NOT_EVIDENCED";

export type EvidenceItem = {
  requirement: string;
  level: EvidenceLevel;
  /** Where the evidence came from, e.g. "Profile: technologies", "CV: Acme Ltd". */
  source: string | null;
  /** Shown to the user verbatim. */
  note: string;
};

export type DimensionKey =
  | "technicalSkills"
  | "relevantExperience"
  | "responsibilities"
  | "industry"
  | "seniority"
  | "contractPreferences"
  | "location"
  | "rate";

export type DimensionResult = {
  key: DimensionKey;
  label: string;
  /** 0..1 before weighting. */
  score: number;
  /** Percentage points this dimension contributes at most. */
  weight: number;
  /** score * weight, rounded for display. */
  contribution: number;
  /** One line explaining how this dimension was scored. */
  explanation: string;
  evidence: EvidenceItem[];
  /**
   * True when we had too little information to score fairly. Unknown
   * dimensions are excluded and their weight redistributed, rather than
   * being scored as zero - an advert that omits IR35 is not a bad match.
   */
  indeterminate: boolean;
};

export type MatchBreakdown = {
  /** 0..100 */
  score: number;
  recommendation: Recommendation;
  dimensions: DimensionResult[];
  strengths: string[];
  gaps: string[];
  /** Requirements we could not assess either way. */
  unknowns: string[];
  /** Weight actually applied, after redistributing indeterminate dimensions. */
  effectiveWeightTotal: number;
  /** Set when the job has not been AI-analysed, so scoring used the raw advert. */
  usedFallbackAnalysis: boolean;
  /**
   * Present when the score was held below what the arithmetic produced, and
   * why. Redistributing the weight of a dimension we cannot assess is right
   * for a minor one, but not for technical skills: doing so let an advert with
   * no recognisable skills score 85% on length of service alone.
   */
  cappedAt?: number;
  capReason?: string;
  scoredAt: string;
};

/**
 * The highest score awardable when technical skills could not be assessed.
 * Deliberately inside POSSIBLE_MATCH: without knowing whether the person has
 * the skills, "worth a look" is the strongest honest claim.
 */
export const UNASSESSED_SKILLS_CAP = 60;

export type Recommendation =
  | "STRONG_MATCH"
  | "GOOD_MATCH"
  | "POSSIBLE_MATCH"
  | "WEAK_MATCH";

/**
 * Weights from docs/product-spec.md section 12. They total 100.
 */
export const WEIGHTS: Record<DimensionKey, number> = {
  technicalSkills: 30,
  relevantExperience: 20,
  responsibilities: 15,
  industry: 10,
  seniority: 10,
  contractPreferences: 5,
  location: 5,
  rate: 5,
};

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  technicalSkills: "Technical skills",
  relevantExperience: "Relevant experience",
  responsibilities: "Responsibilities",
  industry: "Industry experience",
  seniority: "Seniority",
  contractPreferences: "Contract preferences",
  location: "Location",
  rate: "Rate",
};

export function recommendationFor(score: number): Recommendation {
  if (score >= 85) return "STRONG_MATCH";
  if (score >= 70) return "GOOD_MATCH";
  if (score >= 50) return "POSSIBLE_MATCH";
  return "WEAK_MATCH";
}

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  STRONG_MATCH: "Strong match",
  GOOD_MATCH: "Good match",
  POSSIBLE_MATCH: "Possible match",
  WEAK_MATCH: "Weak match",
};

export const RECOMMENDATION_ACTIONS: Record<Recommendation, string> = {
  STRONG_MATCH: "Apply",
  GOOD_MATCH: "Worth applying - tailor your CV first",
  POSSIBLE_MATCH: "Read the advert carefully before spending time on it",
  WEAK_MATCH: "Probably not worth applying",
};
