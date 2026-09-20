"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { fetchJobsAction, type ActionResult } from "@/lib/actions/jobs";

function FetchButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Searching..." : "Search live jobs"}
    </button>
  );
}

/**
 * Two distinct things share this panel:
 *  - "Search live jobs" calls the job sources and stores what comes back
 *  - the filter row below narrows what is already stored, with no API call
 */
export function JobSearchPanel({
  defaults,
  sourcesConfigured,
  sourceNames,
}: {
  defaults: Record<string, string | undefined>;
  sourcesConfigured: boolean;
  sourceNames: string[];
}) {
  const [state, action] = useActionState(fetchJobsAction, {} as ActionResult);
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="card" style={{ padding: "1.1rem" }}>
      {state.error && (
        <div className="alert alert-error" style={{ marginBottom: "0.9rem" }}>
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="alert alert-success" style={{ marginBottom: "0.9rem" }}>
          {state.success}
        </div>
      )}

      <form action={action}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))",
            gap: "0.7rem",
            alignItems: "end",
          }}
        >
          <div>
            <label className="label" htmlFor="keywords">
              Keywords
            </label>
            <input
              id="keywords"
              name="keywords"
              className="input"
              placeholder="Senior Test Analyst"
              defaultValue={defaults.q}
            />
          </div>
          <div>
            <label className="label" htmlFor="keywordMode">
              Match
            </label>
            <select
              id="keywordMode"
              name="keywordMode"
              className="select"
              defaultValue="all"
            >
              <option value="all">All of these words</option>
              <option value="any">Any of these words</option>
              <option value="phrase">This exact phrase</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="location">
              Location
            </label>
            <input
              id="location"
              name="location"
              className="input"
              placeholder="London"
              defaultValue={defaults.location}
            />
          </div>
          <div>
            <label className="label" htmlFor="radiusMiles">
              Radius
            </label>
            <select
              id="radiusMiles"
              name="radiusMiles"
              className="select"
              defaultValue="25"
            >
              <option value="5">5 miles</option>
              <option value="10">10 miles</option>
              <option value="25">25 miles</option>
              <option value="50">50 miles</option>
              <option value="100">100 miles</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="minDayRate">
              Minimum rate
            </label>
            <input
              id="minDayRate"
              name="minDayRate"
              type="number"
              min={0}
              step={25}
              className="input"
              placeholder="450"
              defaultValue={defaults.minRate}
            />
          </div>
          <div>
            <label className="label" htmlFor="postedWithinDays">
              Posted
            </label>
            <select
              id="postedWithinDays"
              name="postedWithinDays"
              className="select"
              defaultValue="7"
            >
              <option value="1">Last 24 hours</option>
              <option value="3">Last 3 days</option>
              <option value="7">Last 7 days</option>
              <option value="14">Last 14 days</option>
            </select>
          </div>
          <FetchButton />
        </div>
      </form>

      <p className="hint" style={{ marginTop: "0.7rem" }}>
        {sourcesConfigured
          ? `Searches ${sourceNames.join(", ")} and stores the results. "All of these words" is the accurate default; "any" widens a search that returns nothing, but pulls in unrelated roles that merely share a word. Job boards return only a short extract of each advert, so always open the original before applying.`
          : "No job source configured - add Adzuna credentials to the server environment."}
      </p>

      <button
        type="button"
        className="btn btn-sm"
        style={{ marginTop: "0.6rem" }}
        onClick={() => setShowFilters((value) => !value)}
        aria-expanded={showFilters}
      >
        {showFilters ? "Hide filters" : "Filter stored jobs"}
      </button>

      {showFilters && (
        <form
          method="get"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))",
            gap: "0.7rem",
            alignItems: "end",
            marginTop: "0.9rem",
            paddingTop: "0.9rem",
            borderTop: "1px solid var(--border)",
          }}
        >
          <div>
            <label className="label" htmlFor="q">
              Contains
            </label>
            <input id="q" name="q" className="input" defaultValue={defaults.q} />
          </div>
          <div>
            <label className="label" htmlFor="filter-location">
              Location
            </label>
            <input
              id="filter-location"
              name="location"
              className="input"
              defaultValue={defaults.location}
            />
          </div>
          <div>
            <label className="label" htmlFor="ir35">
              IR35
            </label>
            <select id="ir35" name="ir35" className="select" defaultValue={defaults.ir35 ?? "ANY"}>
              <option value="ANY">Any</option>
              <option value="OUTSIDE">Outside</option>
              <option value="INSIDE">Inside</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="remote">
              Working
            </label>
            <select
              id="remote"
              name="remote"
              className="select"
              defaultValue={defaults.remote ?? "ANY"}
            >
              <option value="ANY">Any</option>
              <option value="REMOTE">Remote</option>
              <option value="HYBRID">Hybrid</option>
              <option value="ONSITE">On-site</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="minScore">
              Minimum match
            </label>
            <select
              id="minScore"
              name="minScore"
              className="select"
              defaultValue={defaults.minScore ?? ""}
            >
              <option value="">Any</option>
              <option value="85">85% and above</option>
              <option value="70">70% and above</option>
              <option value="50">50% and above</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="sort">
              Sort by
            </label>
            <select id="sort" name="sort" className="select" defaultValue={defaults.sort ?? "date"}>
              <option value="date">Newest first</option>
              <option value="match">Best match</option>
              <option value="rate">Highest rate</option>
            </select>
          </div>
          <button type="submit" className="btn">
            Apply filters
          </button>
        </form>
      )}
    </div>
  );
}
