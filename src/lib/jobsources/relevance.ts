/**
 * Does an advert actually match what the user searched for?
 *
 * Providers interpret keywords loosely. Asked for "test analyst", Careerjet
 * returns HR, SAP and finance analysts on the strength of "analyst" alone -
 * 6 of its first 104 results were testing roles. This applies the user's
 * chosen mode ourselves, identically for every provider, before anything is
 * stored.
 *
 * Pure and provider-agnostic, so it lives beside the adapters but knows
 * nothing about any of them.
 */

export type KeywordMode = "all" | "any" | "phrase";

/** Words that carry no meaning in a job search and would match everything. */
const STOPWORDS = new Set(["and", "or", "the", "a", "an", "of", "in", "for", "to", "with", "on", "at"]);

/**
 * The search split into terms. Keeps characters that matter in tech names
 * ("c#", ".net", "c++") and drops stopwords.
 */
export function keywordTerms(keywords: string | undefined | null): string[] {
  if (!keywords) return [];
  return keywords
    .toLowerCase()
    .split(/[^a-z0-9#+.]+/)
    .map((term) => term.replace(/^\.+(?=[a-z])/, ".").replace(/\.+$/, ""))
    .filter((term) => term && !STOPWORDS.has(term));
}

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A term matches at the start of a word, so "test" finds "testing" and
 * "tester" but not "contest", and "qa" does not match "aqua".
 */
function termPattern(term: string): RegExp {
  return new RegExp(`(?<![a-z0-9])${escape(term)}`, "i");
}

/**
 * With "all of these words", every word must appear somewhere AND at least one
 * must be in the title. Words alone cannot tell a Media Manager advert that
 * mentions "stands the test of time" and "analyst data" from a Test Analyst
 * role; the title can, because it names the job. "QA Analyst" and "Software
 * Tester" still pass a search for "test analyst" - each has one word in its
 * title and the other in the advert.
 *
 * "Any" and "phrase" are deliberate choices by the user and are applied to the
 * whole advert as asked.
 */
export function matchesKeywords(
  job: { title: string; description: string },
  keywords: string | undefined | null,
  mode: KeywordMode = "all",
): boolean {
  const terms = keywordTerms(keywords);
  if (terms.length === 0) return true;
  const text = `${job.title}\n${job.description}`;

  if (mode === "phrase") {
    // The words in order, allowing any punctuation or spacing between them.
    const pattern = new RegExp(
      `(?<![a-z0-9])${terms.map(escape).join("[^a-z0-9]+")}`,
      "i",
    );
    return pattern.test(text);
  }

  const patterns = terms.map(termPattern);
  if (mode === "any") return patterns.some((p) => p.test(text));
  return patterns.every((p) => p.test(text)) && patterns.some((p) => p.test(job.title));
}
