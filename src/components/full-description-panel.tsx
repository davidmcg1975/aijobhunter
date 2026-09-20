"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveFullDescriptionAction, type ActionResult } from "@/lib/actions/jobs";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving and re-analysing..." : "Save the full advert"}
    </button>
  );
}

/**
 * Lets the user paste the real advert in from the original posting.
 *
 * Job boards return a short extract through their API, and everything the app
 * does with a job - requirements, match score, tailoring - is only as good as
 * that text. This is the one place a user can lift that ceiling, so it is
 * shown prominently while the advert is still a fragment.
 */
export function FullDescriptionPanel({
  jobId,
  jobUrl,
  source,
  extractLength,
  fullLength,
}: {
  jobId: string;
  jobUrl: string;
  source: string;
  extractLength: number;
  fullLength: number | null;
}) {
  const [state, action] = useActionState(
    saveFullDescriptionAction,
    {} as ActionResult,
  );
  const [open, setOpen] = useState(false);

  const hasFull = fullLength !== null && fullLength > 0;

  return (
    <section
      className="card"
      style={{
        padding: "1.1rem",
        borderColor: hasFull ? "var(--border)" : "var(--warning)",
      }}
      id="full-advert"
    >
      <h2 style={{ margin: "0 0 0.3rem", fontSize: "1.05rem" }}>
        {hasFull ? "Full advert saved" : "Improve this match"}
      </h2>

      {hasFull ? (
        <p className="muted" style={{ margin: "0 0 0.8rem", fontSize: "0.88rem" }}>
          The full advert ({fullLength.toLocaleString("en-GB")} characters) has
          been saved, so the requirements and match score are based on the whole
          posting rather than the {extractLength}-character extract from {source}.
        </p>
      ) : (
        <p className="muted" style={{ margin: "0 0 0.8rem", fontSize: "0.88rem" }}>
          {source} only gives us the first {extractLength} characters of this
          advert through its API. Open the original, copy the whole advert and
          paste it below - the requirements, your match score and any tailored
          CV will all be rebuilt from the real thing.
        </p>
      )}

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

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {jobUrl && (
          <a
            href={jobUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="btn btn-sm"
          >
            Open the original advert
          </a>
        )}
        <button
          type="button"
          className={hasFull ? "btn btn-sm" : "btn btn-sm btn-primary"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Cancel" : hasFull ? "Replace the saved text" : "Paste the advert"}
        </button>
      </div>

      {open && (
        <form action={action} style={{ marginTop: "1rem" }}>
          <input type="hidden" name="jobId" value={jobId} />
          <label className="label" htmlFor="fullDescription">
            Paste the whole advert
          </label>
          <textarea
            id="fullDescription"
            name="fullDescription"
            className="textarea"
            rows={12}
            required
            placeholder="Select all the advert text on the original page, copy it, and paste it here."
            style={{ fontFamily: "inherit" }}
          />
          <p className="hint">
            Paste only the advert itself. Nothing is sent anywhere - it is stored
            against this job so the AI can read the real requirements.
          </p>
          <Submit />
        </form>
      )}
    </section>
  );
}
