import "server-only";
import { AdzunaSource } from "./adzuna";
import { ReedSource } from "./reed";
import { CareerjetSource } from "./careerjet";
import type { JobSource } from "./types";

/**
 * The single place that knows which providers exist.
 *
 * Adding JobServe / Reed / CWJobs / CV-Library means writing an adapter that
 * implements JobSource and adding it to this array. Nothing else in the
 * application refers to a provider by name.
 */
const SOURCES: JobSource[] = [
  new AdzunaSource(),
  new ReedSource(),
  new CareerjetSource(),
];

export function allSources(): JobSource[] {
  return SOURCES;
}

export function getSource(id: string): JobSource | undefined {
  return SOURCES.find((s) => s.id === id);
}

/**
 * The installation's own configuration only - for the admin page. What a
 * particular user can search, including with their own keys, is
 * sourceStatusFor() in ./credentials.ts.
 */
export function sourceStatus(): Array<{
  id: string;
  displayName: string;
  configured: boolean;
}> {
  return SOURCES.map((s) => ({
    id: s.id,
    displayName: s.displayName,
    configured: s.environmentCredentials() !== null,
  }));
}
