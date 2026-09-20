import {
  DIMENSION_LABELS,
  WEIGHTS,
  recommendationFor,
  UNASSESSED_SKILLS_CAP,
  type DimensionKey,
  type DimensionResult,
  type EvidenceItem,
  type MatchBreakdown,
} from "./types";
import {
  AI_TESTING_SKILLS,
  canonicaliseList,
  extractSkills,
  isRelated,
} from "./skills";

/**
 * The match engine is deliberately deterministic and free of AI calls.
 *
 * Two reasons: it must produce the same score twice for the same inputs, and
 * every number must be traceable to a rule the user can read. The AI's role is
 * to structure the job advert (JobAnalysis) and the CV (Profile) beforehand;
 * the arithmetic afterwards is ours.
 */

export type MatchProfile = {
  jobTitles: string[];
  yearsExperience: number | null;
  industries: string[];
  technologies: string[];
  testingMethodologies: string[];
  aiTestingSkills: string[];
  certifications: string[];
  managementExperience: string | null;
  minDayRate: number | null;
  preferredDayRate: number | null;
  maxCommuteMiles: number | null;
  remoteModes: string[];
  ir35Stances: string[];
  location: string | null;
  experiences: Array<{
    company: string;
    jobTitle: string;
    startDate: Date | null;
    endDate: Date | null;
    industry: string | null;
    responsibilities: string[];
    technologies: string[];
    description: string | null;
  }>;
  /** Master CV text, used as corroborating evidence only. */
  cvText: string;
};

export type MatchJob = {
  title: string;
  location: string | null;
  description: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: string;
  remote: string;
  ir35: string;
  analysis: {
    requiredSkills: string[];
    desirableSkills: string[];
    responsibilities: string[];
    technologies: string[];
    testingMethodologies: string[];
    aiTestingSkills: string[];
    industry: string | null;
    seniority: string | null;
    inferredRateMin: number | null;
    inferredRateMax: number | null;
    inferredLengthMonths: number | null;
  } | null;
};

const SENIORITY_RANK: Record<string, number> = {
  junior: 1,
  mid: 2,
  intermediate: 2,
  senior: 3,
  lead: 4,
  principal: 5,
  manager: 4,
  head: 5,
  director: 6,
};

function seniorityOf(text: string): number | null {
  const t = text.toLowerCase();
  // Longest/most senior first so "senior test lead" reads as lead.
  for (const key of ["director", "head of", "principal", "lead", "manager", "senior", "junior", "graduate"]) {
    if (t.includes(key)) {
      if (key === "head of") return SENIORITY_RANK.head!;
      if (key === "graduate") return SENIORITY_RANK.junior!;
      return SENIORITY_RANK[key] ?? null;
    }
  }
  return null;
}

/** Everything the user has genuinely evidenced, as canonical skill names. */
function userSkillEvidence(profile: MatchProfile): Map<string, string> {
  const evidence = new Map<string, string>();

  const record = (skills: Iterable<string>, source: string) => {
    for (const skill of skills) {
      if (!evidence.has(skill)) evidence.set(skill, source);
    }
  };

  record(canonicaliseList(profile.technologies), "Profile: technologies");
  record(canonicaliseList(profile.testingMethodologies), "Profile: methodologies");
  record(canonicaliseList(profile.aiTestingSkills), "Profile: AI testing skills");
  record(canonicaliseList(profile.certifications), "Profile: certifications");

  for (const exp of profile.experiences) {
    record(canonicaliseList(exp.technologies), `CV: ${exp.company}`);
    record(extractSkills(exp.responsibilities.join(" ")), `CV: ${exp.company}`);
    if (exp.description) record(extractSkills(exp.description), `CV: ${exp.company}`);
  }

  record(extractSkills(profile.cvText), "CV");

  return evidence;
}

function scoreTechnicalSkills(
  profile: MatchProfile,
  job: MatchJob,
): DimensionResult {
  const evidence = userSkillEvidence(profile);
  const analysis = job.analysis;

  const required = canonicaliseList(
    analysis?.requiredSkills.length
      ? [...analysis.requiredSkills, ...analysis.technologies]
      : [...extractSkills(job.description)],
  );
  const desirable = canonicaliseList(analysis?.desirableSkills ?? []);

  const items: EvidenceItem[] = [];
  let earned = 0;
  let possible = 0;

  const assess = (skill: string, weight: number) => {
    possible += weight;
    if (evidence.has(skill)) {
      earned += weight;
      items.push({
        requirement: skill,
        level: "CONFIRMED",
        source: evidence.get(skill)!,
        note: `You have demonstrated ${skill}.`,
      });
      return;
    }
    // Related experience counts for part marks, and is labelled as inference.
    const relative = [...evidence.keys()].find((held) => isRelated(held, skill));
    if (relative) {
      earned += weight * 0.5;
      items.push({
        requirement: skill,
        level: "INFERRED",
        source: evidence.get(relative)!,
        note: `Not evidenced directly, but your ${relative} experience is closely related.`,
      });
      return;
    }
    items.push({
      requirement: skill,
      level: "NOT_EVIDENCED",
      source: null,
      note: `${skill} is not evidenced in your CV or profile. That does not mean you cannot do it - add it to your profile if you can.`,
    });
  };

  for (const skill of required) assess(skill, 1);
  for (const skill of desirable) if (!required.includes(skill)) assess(skill, 0.4);

  // A vacancy that names no recognisable skills cannot be scored on skills.
  if (possible === 0) {
    return indeterminate(
      "technicalSkills",
      "The advert does not name any specific tools or skills, so this could not be scored.",
    );
  }

  return {
    key: "technicalSkills",
    label: DIMENSION_LABELS.technicalSkills,
    score: clamp(earned / possible),
    weight: WEIGHTS.technicalSkills,
    contribution: round(clamp(earned / possible) * WEIGHTS.technicalSkills),
    explanation: `${items.filter((i) => i.level === "CONFIRMED").length} of ${items.length} named skills are evidenced in your profile.`,
    evidence: items,
    indeterminate: false,
  };
}

function scoreRelevantExperience(
  profile: MatchProfile,
  job: MatchJob,
): DimensionResult {
  const items: EvidenceItem[] = [];
  const jobTitle = job.title.toLowerCase();

  // Years of experience against the seniority the advert implies.
  const years = profile.yearsExperience ?? estimateYears(profile);
  const wanted = requiredYears(job);

  let yearsScore = 0.5;
  if (years !== null && wanted !== null) {
    yearsScore = clamp(years / wanted);
    items.push({
      requirement: `Around ${wanted} years' experience`,
      level: years >= wanted ? "CONFIRMED" : "NOT_EVIDENCED",
      source: "Profile: years of experience",
      note:
        years >= wanted
          ? `You have ${years} years, which meets the ${wanted} the advert implies.`
          : `Your profile shows ${years} years against roughly ${wanted} implied by the advert.`,
    });
  } else if (years !== null) {
    yearsScore = clamp(years / 5);
    items.push({
      requirement: "Length of experience",
      level: "CONFIRMED",
      source: "Profile: years of experience",
      note: `You have ${years} years of experience. The advert does not state a requirement.`,
    });
  } else {
    items.push({
      requirement: "Length of experience",
      level: "NOT_EVIDENCED",
      source: null,
      note: "Add your years of experience to your profile to score this properly.",
    });
  }

  // Overlap between held job titles and the advertised title.
  const titleWords = new Set(
    jobTitle.replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 3),
  );
  let bestTitleOverlap = 0;
  let bestTitle = "";
  for (const held of [...profile.jobTitles, ...profile.experiences.map((e) => e.jobTitle)]) {
    const heldWords = new Set(
      held.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 3),
    );
    let overlap = 0;
    for (const word of titleWords) if (heldWords.has(word)) overlap += 1;
    const ratio = titleWords.size ? overlap / titleWords.size : 0;
    if (ratio > bestTitleOverlap) {
      bestTitleOverlap = ratio;
      bestTitle = held;
    }
  }

  if (bestTitle) {
    items.push({
      requirement: `Experience as ${job.title}`,
      level: bestTitleOverlap >= 0.5 ? "CONFIRMED" : "INFERRED",
      source: "CV: job titles",
      note:
        bestTitleOverlap >= 0.5
          ? `You have held the closely comparable title "${bestTitle}".`
          : `Your nearest previous title is "${bestTitle}".`,
    });
  }

  const score = yearsScore * 0.6 + bestTitleOverlap * 0.4;
  return {
    key: "relevantExperience",
    label: DIMENSION_LABELS.relevantExperience,
    score: clamp(score),
    weight: WEIGHTS.relevantExperience,
    contribution: round(clamp(score) * WEIGHTS.relevantExperience),
    explanation: "Based on your years of experience and how close your previous job titles are.",
    evidence: items,
    indeterminate: false,
  };
}

function scoreResponsibilities(
  profile: MatchProfile,
  job: MatchJob,
): DimensionResult {
  const wanted = job.analysis?.responsibilities ?? [];
  if (wanted.length === 0) {
    return indeterminate(
      "responsibilities",
      "The advert does not set out distinct responsibilities, so this could not be scored.",
    );
  }

  const userText = [
    ...profile.experiences.flatMap((e) => [
      ...e.responsibilities,
      e.description ?? "",
    ]),
    profile.managementExperience ?? "",
    profile.cvText,
  ]
    .join("\n")
    .toLowerCase();

  const items: EvidenceItem[] = [];
  let matched = 0;

  for (const responsibility of wanted) {
    const keywords = responsibility
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 4);

    if (keywords.length === 0) continue;
    const hits = keywords.filter((w) => userText.includes(w)).length;
    const ratio = hits / keywords.length;

    if (ratio >= 0.5) {
      matched += 1;
      items.push({
        requirement: responsibility,
        level: "CONFIRMED",
        source: "CV: responsibilities",
        note: "Your CV describes comparable work.",
      });
    } else if (ratio >= 0.25) {
      matched += 0.5;
      items.push({
        requirement: responsibility,
        level: "INFERRED",
        source: "CV: responsibilities",
        note: "Your CV partly covers this.",
      });
    } else {
      items.push({
        requirement: responsibility,
        level: "NOT_EVIDENCED",
        source: null,
        note: "Your CV does not describe this. Consider adding it if you have done it.",
      });
    }
  }

  const score = wanted.length ? matched / wanted.length : 0;
  return {
    key: "responsibilities",
    label: DIMENSION_LABELS.responsibilities,
    score: clamp(score),
    weight: WEIGHTS.responsibilities,
    contribution: round(clamp(score) * WEIGHTS.responsibilities),
    explanation: `Your CV covers ${Math.round(score * 100)}% of the duties the advert lists.`,
    evidence: items,
    indeterminate: false,
  };
}

function scoreIndustry(profile: MatchProfile, job: MatchJob): DimensionResult {
  const target = job.analysis?.industry;
  if (!target) {
    return indeterminate(
      "industry",
      "The advert does not state the client's sector, so this could not be scored.",
    );
  }

  const held = [
    ...profile.industries,
    ...profile.experiences.map((e) => e.industry ?? ""),
  ]
    .filter(Boolean)
    .map((i) => i.toLowerCase());

  const targetLower = target.toLowerCase();
  const exact = held.some(
    (h) => h.includes(targetLower) || targetLower.includes(h),
  );

  return {
    key: "industry",
    label: DIMENSION_LABELS.industry,
    score: exact ? 1 : 0,
    weight: WEIGHTS.industry,
    contribution: round((exact ? 1 : 0) * WEIGHTS.industry),
    explanation: exact
      ? `You have worked in ${target}.`
      : `The role is in ${target}, which is not in your recorded industry experience.`,
    evidence: [
      {
        requirement: `${target} experience`,
        level: exact ? "CONFIRMED" : "NOT_EVIDENCED",
        source: exact ? "Profile: industries" : null,
        note: exact
          ? `Your profile records ${target} experience.`
          : `No ${target} experience recorded. Sector experience is often preferred rather than required.`,
      },
    ],
    indeterminate: false,
  };
}

function scoreSeniority(profile: MatchProfile, job: MatchJob): DimensionResult {
  const wantedRank =
    (job.analysis?.seniority ? SENIORITY_RANK[job.analysis.seniority.toLowerCase()] : null) ??
    seniorityOf(job.title);

  if (!wantedRank) {
    return indeterminate(
      "seniority",
      "The advert does not indicate a seniority level, so this could not be scored.",
    );
  }

  const heldRanks = [...profile.jobTitles, ...profile.experiences.map((e) => e.jobTitle)]
    .map((t) => seniorityOf(t))
    .filter((r): r is number => r !== null);

  if (heldRanks.length === 0) {
    return indeterminate(
      "seniority",
      "Your job titles do not indicate a seniority level, so this could not be scored.",
    );
  }

  const heldRank = Math.max(...heldRanks);
  const gap = heldRank - wantedRank;

  // At or above the level scores full; one level below is a genuine stretch;
  // being well above is a mild negative because the role may be a step down.
  let score: number;
  if (gap === 0) score = 1;
  else if (gap > 0) score = Math.max(0.75, 1 - gap * 0.1);
  else if (gap === -1) score = 0.6;
  else score = 0.25;

  return {
    key: "seniority",
    label: DIMENSION_LABELS.seniority,
    score,
    weight: WEIGHTS.seniority,
    contribution: round(score * WEIGHTS.seniority),
    explanation:
      gap >= 0
        ? "Your seniority meets or exceeds the level advertised."
        : "The role is advertised above your recorded level.",
    evidence: [
      {
        requirement: `${job.analysis?.seniority ?? "Advertised"} level`,
        level: gap >= 0 ? "CONFIRMED" : "INFERRED",
        source: "CV: job titles",
        note:
          gap >= 0
            ? "Your previous titles are at or above this level."
            : "This would be a step up from your recorded titles.",
      },
    ],
    indeterminate: false,
  };
}

function scoreContractPreferences(
  profile: MatchProfile,
  job: MatchJob,
): DimensionResult {
  const items: EvidenceItem[] = [];
  const jobIr35 = job.ir35 !== "UNKNOWN" ? job.ir35 : (job.analysis?.inferredRateMin ? "UNKNOWN" : "UNKNOWN");

  if (profile.ir35Stances.length === 0 || jobIr35 === "UNKNOWN") {
    return indeterminate(
      "contractPreferences",
      jobIr35 === "UNKNOWN"
        ? "The advert does not state its IR35 status, so this could not be scored."
        : "Set your IR35 preference in your profile to score this.",
    );
  }

  const acceptable = profile.ir35Stances.includes(jobIr35);
  items.push({
    requirement: `${jobIr35 === "OUTSIDE" ? "Outside" : "Inside"} IR35`,
    level: acceptable ? "CONFIRMED" : "NOT_EVIDENCED",
    source: "Profile: contract preferences",
    note: acceptable
      ? "This matches your stated IR35 preference."
      : "This does not match your stated IR35 preference.",
  });

  return {
    key: "contractPreferences",
    label: DIMENSION_LABELS.contractPreferences,
    score: acceptable ? 1 : 0,
    weight: WEIGHTS.contractPreferences,
    contribution: round((acceptable ? 1 : 0) * WEIGHTS.contractPreferences),
    explanation: acceptable
      ? "The contract terms match your preferences."
      : "The IR35 status does not match your preferences.",
    evidence: items,
    indeterminate: false,
  };
}

function scoreLocation(profile: MatchProfile, job: MatchJob): DimensionResult {
  const jobRemote = job.remote;
  const prefs = profile.remoteModes;

  if (prefs.length === 0) {
    return indeterminate(
      "location",
      "Set your remote working preference in your profile to score this.",
    );
  }

  // Fully remote suits anyone who will accept remote, wherever they live.
  if (jobRemote === "REMOTE") {
    const ok = prefs.includes("REMOTE");
    return simpleDimension(
      "location",
      ok ? 1 : 0.3,
      ok ? "This is a remote role, which you accept." : "This is a remote role; your profile prefers on-site or hybrid.",
      [
        {
          requirement: "Remote working",
          level: ok ? "CONFIRMED" : "NOT_EVIDENCED",
          source: "Profile: remote preference",
          note: ok ? "Matches your preference." : "Does not match your preference.",
        },
      ],
    );
  }

  if (jobRemote === "UNKNOWN") {
    return indeterminate(
      "location",
      "The advert does not state its working arrangement, so this could not be scored.",
    );
  }

  const modeOk = prefs.includes(jobRemote);
  const sameArea =
    profile.location && job.location
      ? job.location.toLowerCase().includes(profile.location.toLowerCase().split(",")[0]!.trim()) ||
        profile.location.toLowerCase().includes(job.location.toLowerCase().split(",")[0]!.trim())
      : null;

  let score = modeOk ? 0.7 : 0.2;
  if (sameArea === true) score = Math.min(1, score + 0.3);
  if (sameArea === false) score = Math.max(0, score - 0.2);

  return simpleDimension(
    "location",
    score,
    sameArea === true
      ? `${titleCase(jobRemote)} in ${job.location}, which is near you.`
      : `${titleCase(jobRemote)} in ${job.location ?? "an unstated location"}.`,
    [
      {
        requirement: `${titleCase(jobRemote)} working`,
        level: modeOk ? "CONFIRMED" : "NOT_EVIDENCED",
        source: "Profile: remote preference",
        note: modeOk
          ? "Matches your stated working preference."
          : "Does not match your stated working preference.",
      },
    ],
  );
}

function scoreRate(profile: MatchProfile, job: MatchJob): DimensionResult {
  const jobMin =
    job.analysis?.inferredRateMin ??
    (job.salaryPeriod === "DAY" ? job.salaryMin : null);
  const jobMax =
    job.analysis?.inferredRateMax ??
    (job.salaryPeriod === "DAY" ? job.salaryMax : null);

  const offered = jobMax ?? jobMin;
  const wanted = profile.preferredDayRate ?? profile.minDayRate;

  if (offered === null || wanted === null) {
    return indeterminate(
      "rate",
      offered === null
        ? "The advert does not quote a day rate, so this could not be scored."
        : "Set your target day rate in your profile to score this.",
    );
  }

  const minimum = profile.minDayRate ?? wanted;
  let score: number;
  let explanation: string;

  if (offered >= wanted) {
    score = 1;
    explanation = `£${offered}/day meets your target of £${wanted}/day.`;
  } else if (offered >= minimum) {
    score = 0.6;
    explanation = `£${offered}/day is above your minimum of £${minimum} but below your target of £${wanted}.`;
  } else {
    score = clamp(offered / minimum) * 0.4;
    explanation = `£${offered}/day is below your minimum of £${minimum}/day.`;
  }

  return simpleDimension("rate", score, explanation, [
    {
      requirement: `At least £${minimum}/day`,
      level: offered >= minimum ? "CONFIRMED" : "NOT_EVIDENCED",
      source: "Profile: contract preferences",
      note: explanation,
    },
  ]);
}

/**
 * Scores a job against a profile.
 *
 * Dimensions we genuinely cannot assess are marked indeterminate and their
 * weight is redistributed across the rest, so a sparse advert does not drag
 * a good match down to nothing.
 */
export function scoreMatch(profile: MatchProfile, job: MatchJob): MatchBreakdown {
  const dimensions: DimensionResult[] = [
    scoreTechnicalSkills(profile, job),
    scoreRelevantExperience(profile, job),
    scoreResponsibilities(profile, job),
    scoreIndustry(profile, job),
    scoreSeniority(profile, job),
    scoreContractPreferences(profile, job),
    scoreLocation(profile, job),
    scoreRate(profile, job),
  ];

  const scored = dimensions.filter((d) => !d.indeterminate);
  const effectiveWeightTotal = scored.reduce((sum, d) => sum + d.weight, 0);

  const rawScore =
    effectiveWeightTotal === 0
      ? 0
      : Math.round(
          (scored.reduce((sum, d) => sum + d.score * d.weight, 0) /
            effectiveWeightTotal) *
            100,
        );

  // Technical skills carry 30% - more than any other dimension - and are the
  // main thing that makes a role a match at all. Redistributing that weight
  // when it cannot be assessed inflates the score rather than expressing the
  // uncertainty: a live search produced "AML Analyst, 85% match" for a
  // software tester, scored almost entirely on length of service. So the
  // score is capped instead, and the reason is shown.
  const skills = dimensions.find((d) => d.key === "technicalSkills");
  const skillsUnassessed = skills?.indeterminate ?? true;

  const score =
    skillsUnassessed && rawScore > UNASSESSED_SKILLS_CAP
      ? UNASSESSED_SKILLS_CAP
      : rawScore;

  const capReason =
    score !== rawScore
      ? "The advert names no skills we recognise, so the largest part of the score could not be assessed. " +
        "This score reflects only the things that could be checked - it is not evidence of a good fit. " +
        "Paste the full advert, or analyse it with AI, for a real score."
      : undefined;

  const allEvidence = dimensions.flatMap((d) => d.evidence);

  return {
    score,
    recommendation: recommendationFor(score),
    dimensions,
    strengths: allEvidence
      .filter((e) => e.level === "CONFIRMED")
      .map((e) => e.requirement)
      .slice(0, 12),
    gaps: allEvidence
      .filter((e) => e.level === "NOT_EVIDENCED")
      .map((e) => e.requirement)
      .slice(0, 12),
    unknowns: dimensions
      .filter((d) => d.indeterminate)
      .map((d) => d.explanation),
    effectiveWeightTotal,
    usedFallbackAnalysis: job.analysis === null,
    cappedAt: score !== rawScore ? UNASSESSED_SKILLS_CAP : undefined,
    capReason,
    scoredAt: new Date().toISOString(),
  };
}

// --- helpers ---------------------------------------------------------------

function clamp(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function indeterminate(key: DimensionKey, explanation: string): DimensionResult {
  return {
    key,
    label: DIMENSION_LABELS[key],
    score: 0,
    weight: WEIGHTS[key],
    contribution: 0,
    explanation,
    evidence: [],
    indeterminate: true,
  };
}

function simpleDimension(
  key: DimensionKey,
  score: number,
  explanation: string,
  evidence: EvidenceItem[],
): DimensionResult {
  const clamped = clamp(score);
  return {
    key,
    label: DIMENSION_LABELS[key],
    score: clamped,
    weight: WEIGHTS[key],
    contribution: round(clamped * WEIGHTS[key]),
    explanation,
    evidence,
    indeterminate: false,
  };
}

function estimateYears(profile: MatchProfile): number | null {
  if (profile.experiences.length === 0) return null;
  const earliest = profile.experiences.reduce<Date | null>((min, exp) => {
    if (!exp.startDate) return min; // Undated role - cannot bound the range.
    if (!min || exp.startDate < min) return exp.startDate;
    return min;
  }, null);
  if (!earliest) return null;
  const years = (Date.now() - earliest.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return Math.floor(years);
}

/** Years the advert asks for, e.g. "5+ years' experience". */
function requiredYears(job: MatchJob): number | null {
  const match = job.description.match(
    /\b(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?years?['’]?\s+(?:of\s+)?(?:commercial\s+|proven\s+|relevant\s+)?experience/i,
  );
  if (!match) return null;
  const years = Number(match[1]);
  return years >= 1 && years <= 30 ? years : null;
}
