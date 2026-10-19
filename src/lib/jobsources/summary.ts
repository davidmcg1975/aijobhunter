import { sourceDisplayName } from "./registry";
import type { IngestSummary } from "./ingest";

/**
 * Turns the per-source results of a search into what the user is told.
 *
 * A source that fails while another succeeds must still be reported by name
 * and reason: Careerjet stops working whenever the machine's IP address
 * changes, and "1 source(s) failed" sent nobody to the setting that fixes it.
 *
 * Pure, so the wording is unit tested.
 */

export type IngestOutcome = {
  /** True when nothing could be searched at all - shown as an error. */
  allFailed: boolean;
  message: string;
};

export function describeIngest(summaries: IngestSummary[]): IngestOutcome {
  const failed = summaries.filter((s) => s.error);
  const problems = failed.map(
    (s) => `${sourceDisplayName(s.source)} could not be searched: ${s.error}`,
  );

  if (summaries.length > 0 && failed.length === summaries.length) {
    return { allFailed: true, message: problems.join(" ") };
  }

  const total = (pick: (s: IngestSummary) => number) =>
    summaries.reduce((sum, s) => sum + pick(s), 0);
  const received = total((s) => s.received);
  const skipped = total((s) => s.skipped);
  const created = total((s) => s.created);
  const updated = total((s) => s.updated);
  const duplicates = total((s) => s.duplicates);

  const searched = summaries
    .filter((s) => !s.error)
    .map((s) => sourceDisplayName(s.source))
    .join(" and ");

  const message = [
    `Found ${received} adverts on ${searched}.`,
    skipped ? ` ${skipped} did not match your words and were skipped.` : "",
    ` Kept ${received - skipped}: ${created} new, ${updated} already stored (refreshed), ${duplicates} duplicates of other listings.`,
    problems.length ? ` ${problems.join(" ")}` : "",
  ].join("");

  return { allFailed: false, message };
}
