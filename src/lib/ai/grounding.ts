import { extractSkills } from "@/lib/matching/skills";

/**
 * Prompt rules are necessary but not sufficient. Every piece of AI-written text
 * that claims to describe the user's history is checked here against the source
 * material before it is shown, so a fabrication becomes a visible warning
 * rather than something the user unknowingly sends to a client.
 *
 * This is deliberately conservative: it flags, it does not silently rewrite.
 */

export type GroundingViolation = {
  kind: "date" | "technology" | "employer" | "qualification" | "metric";
  value: string;
  detail: string;
};

export type GroundingReport = {
  passed: boolean;
  violations: GroundingViolation[];
  /** Present in the source but dropped from the output - informational only. */
  omissions: string[];
};

function years(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(/\b(19[5-9]\d|20[0-4]\d)\b/g)) {
    found.add(match[1]!);
  }
  return found;
}

/** Percentages, multipliers and money - the classic invented "achievement". */
function metrics(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(/\b\d{1,3}(?:\.\d+)?%/g)) found.add(match[0]);
  for (const match of text.matchAll(/\b\d+(?:\.\d+)?x\b/gi)) found.add(match[0].toLowerCase());
  for (const match of text.matchAll(/£\s?[\d,]+(?:\.\d+)?\s?[km]?\b/gi)) {
    found.add(match[0].replace(/\s+/g, "").toLowerCase());
  }
  return found;
}

function normaliseCompany(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(ltd|limited|plc|llp|group|uk)\b/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

export type GroundingSource = {
  /** Master CV text plus any other verified free text. */
  text: string;
  /** Employers from the structured profile. */
  employers: string[];
  /** Certifications and qualifications from the structured profile. */
  qualifications: string[];
};

/**
 * Checks AI-generated text against the source of truth.
 *
 * Technologies are checked against a closed taxonomy: a named tool appearing
 * in the output but nowhere in the source is a genuine fabrication, and this
 * catches it reliably without false positives from ordinary prose.
 */
export function verifyGrounding(
  generated: string,
  source: GroundingSource,
): GroundingReport {
  const violations: GroundingViolation[] = [];

  // --- Dates -------------------------------------------------------------
  const sourceYears = years(source.text);
  for (const year of years(generated)) {
    if (!sourceYears.has(year)) {
      violations.push({
        kind: "date",
        value: year,
        detail: `The year ${year} appears in the generated text but not in your CV or profile.`,
      });
    }
  }

  // --- Technologies ------------------------------------------------------
  const sourceSkills = extractSkills(source.text);
  for (const skill of extractSkills(generated)) {
    if (!sourceSkills.has(skill)) {
      violations.push({
        kind: "technology",
        value: skill,
        detail: `"${skill}" appears in the generated text but is not evidenced in your CV or profile.`,
      });
    }
  }

  // --- Qualifications ----------------------------------------------------
  const sourceLower = source.text.toLowerCase();
  const knownQualifications = source.qualifications.map((q) => q.toLowerCase());
  const qualificationPatterns = [
    /\b(bsc|msc|ba|ma|phd|mba|hnd|hnc)\b/gi,
    /\bistqb\s+\w+/gi,
    /\bprince2\b/gi,
  ];
  for (const pattern of qualificationPatterns) {
    for (const match of generated.matchAll(pattern)) {
      const value = match[0].toLowerCase();
      const known =
        sourceLower.includes(value) ||
        knownQualifications.some((q) => q.includes(value));
      if (!known) {
        violations.push({
          kind: "qualification",
          value: match[0],
          detail: `"${match[0]}" appears as a qualification but is not in your profile.`,
        });
      }
    }
  }

  // --- Metrics -----------------------------------------------------------
  const sourceMetrics = metrics(source.text);
  for (const metric of metrics(generated)) {
    if (!sourceMetrics.has(metric)) {
      violations.push({
        kind: "metric",
        value: metric,
        detail: `The figure "${metric}" is not present in your CV - check it before sending.`,
      });
    }
  }

  // --- Employers ---------------------------------------------------------
  const generatedNormalised = normaliseCompany(generated);
  const omissions: string[] = [];
  for (const employer of source.employers) {
    const needle = normaliseCompany(employer);
    if (needle && !generatedNormalised.includes(needle)) {
      omissions.push(employer);
    }
  }

  return {
    passed: violations.length === 0,
    violations: dedupeViolations(violations),
    omissions,
  };
}

function dedupeViolations(violations: GroundingViolation[]): GroundingViolation[] {
  const seen = new Set<string>();
  return violations.filter((v) => {
    const key = `${v.kind}:${v.value.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
