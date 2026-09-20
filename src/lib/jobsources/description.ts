/**
 * Which advert text the rest of the application should use.
 *
 * Job boards return a short extract (Adzuna caps it at 500 characters), so a
 * user can paste the real advert in from the original posting. Everything that
 * reads an advert - AI analysis, skill extraction, match scoring - must go
 * through here rather than reading `description` directly, or it will quietly
 * keep working from the fragment.
 */

export type JobDescriptionFields = {
  description: string;
  descriptionTruncated?: boolean;
  fullDescription?: string | null;
};

/** The best available text for this job. */
export function effectiveDescription(job: JobDescriptionFields): string {
  const full = job.fullDescription?.trim();
  return full && full.length > 0 ? full : job.description;
}

/** True when we are still working from a provider extract. */
export function isDescriptionIncomplete(job: JobDescriptionFields): boolean {
  const full = job.fullDescription?.trim();
  if (full && full.length > 0) return false;
  return Boolean(job.descriptionTruncated);
}

/** Minimum length before a paste is worth accepting over the extract. */
export const MIN_PASTED_DESCRIPTION = 200;
export const MAX_PASTED_DESCRIPTION = 60_000;

export type PastedDescriptionProblem = string;

/**
 * Validates pasted advert text.
 *
 * Deliberately permissive about content - adverts are messy - but it refuses
 * text that is shorter than what we already have, since accepting that would
 * make the analysis worse while looking like an improvement.
 */
export function validatePastedDescription(
  pasted: string,
  existing: string,
): PastedDescriptionProblem | null {
  const text = pasted.trim();

  if (text.length === 0) return "Paste the advert text first.";
  if (text.length < MIN_PASTED_DESCRIPTION) {
    return `That is only ${text.length} characters. Paste the whole advert - the point is to get more detail than the ${existing.length}-character extract.`;
  }
  if (text.length > MAX_PASTED_DESCRIPTION) {
    return "That is longer than any job advert. Paste just the advert, not the whole page.";
  }
  if (text.length < existing.length) {
    return "That is shorter than the extract already stored, so it would lose detail rather than add it.";
  }
  return null;
}

/**
 * Tidies pasted text without changing its meaning: normalises line endings and
 * whitespace, and collapses the runs of blank lines that copying from a web
 * page produces.
 */
export function tidyPastedDescription(pasted: string): string {
  return pasted
    .replace(/\r\n/g, "\n")
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
