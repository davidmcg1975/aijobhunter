"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  createManualJobAction,
  draftManualJobAction,
  type DraftState,
  type SaveJobState,
} from "@/lib/actions/manual-jobs";
import { Field } from "./ui";

/**
 * Adding a job found somewhere this application cannot search.
 *
 * Paste the advert, check what was read out of it, save. The review step is
 * deliberate: these fields drive the match score and everything written from
 * it, so the user confirms them rather than trusting the read.
 */
export function AddJobPanel() {
  const [open, setOpen] = useState(false);
  const [draftState, draftAction] = useActionState(draftManualJobAction, {} as DraftState);

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-sm"
        style={{ marginTop: "0.6rem" }}
        onClick={() => setOpen(true)}
      >
        Add a job from elsewhere
      </button>
    );
  }

  return (
    <div className="card" style={{ padding: "1.1rem", marginTop: "0.9rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
        <h2 style={{ margin: "0 0 0.3rem", fontSize: "1.05rem" }}>
          Add a job from elsewhere
        </h2>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <p className="muted" style={{ margin: "0 0 0.9rem", fontSize: "0.88rem" }}>
        Found a contract on LinkedIn, an agency site or in an email? Paste the
        advert here and it is scored, tailored and tracked like any other job.
        Jobs you add are private to you.
      </p>

      {draftState.draft ? (
        <ReviewForm state={draftState} onStartAgain={() => setOpen(false)} />
      ) : (
        <form action={draftAction}>
          {draftState.error && (
            <div className="alert alert-error" style={{ marginBottom: "0.9rem" }}>
              {draftState.error}
            </div>
          )}
          <Field
            label="The advert"
            hint="Select the whole advert on the original page, copy it, and paste it here."
          >
            <textarea
              name="advert"
              className="textarea"
              rows={10}
              placeholder="Paste the full job advert"
              required
            />
          </Field>
          <Submit label="Read the advert" busy="Reading..." />
        </form>
      )}
    </div>
  );
}

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? busy : label}
    </button>
  );
}

function ReviewForm({
  state,
  onStartAgain,
}: {
  state: DraftState;
  onStartAgain: () => void;
}) {
  const [saveState, saveAction] = useActionState(createManualJobAction, {} as SaveJobState);
  const router = useRouter();
  const draft = state.draft!;

  // Straight to the job once it exists, where the score and the tailoring
  // panels are. In an effect, not during render.
  const savedId = saveState.success ? saveState.jobId : undefined;
  useEffect(() => {
    if (savedId) router.push(`/jobs/${savedId}`);
  }, [savedId, router]);

  return (
    <form action={saveAction}>
      {state.parsedOnly && (
        <div className="alert alert-info" style={{ marginBottom: "0.9rem" }}>
          The advert was read without AI, so most of these are blank - fill in
          what you can. Adding an AI key under Settings fills them in for you.
        </div>
      )}
      {saveState.error && (
        <div className="alert alert-error" style={{ marginBottom: "0.9rem" }}>
          {saveState.error}
          {saveState.jobId && (
            <>
              {" "}
              <a href={`/jobs/${saveState.jobId}`}>Open it</a>.
            </>
          )}
        </div>
      )}

      <p className="muted" style={{ margin: "0 0 0.9rem", fontSize: "0.88rem" }}>
        Check these before saving - the match score is built from them.
      </p>

      <input type="hidden" name="advert" value={draft.advert} />

      <Field label="Job title">
        <input name="title" className="input" defaultValue={draft.title} required />
      </Field>
      <Field label="Company or agency">
        <input name="company" className="input" defaultValue={draft.company ?? ""} />
      </Field>
      <Field label="Location">
        <input name="location" className="input" defaultValue={draft.location ?? ""} />
      </Field>
      <Field label="Link to the advert" hint="Optional, but it is how you find it again later.">
        <input
          name="url"
          type="url"
          className="input"
          placeholder="https://"
          defaultValue={draft.url}
        />
      </Field>

      <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap" }}>
        <Field label="Day rate from">
          <input
            name="rateMin"
            type="number"
            min={0}
            step={25}
            className="input"
            defaultValue={draft.rateMin ?? ""}
          />
        </Field>
        <Field label="Day rate to">
          <input
            name="rateMax"
            type="number"
            min={0}
            step={25}
            className="input"
            defaultValue={draft.rateMax ?? ""}
          />
        </Field>
      </div>

      <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap" }}>
        <Field label="IR35">
          <select name="ir35" className="select" defaultValue={draft.ir35}>
            <option value="UNKNOWN">Not stated</option>
            <option value="INSIDE">Inside IR35</option>
            <option value="OUTSIDE">Outside IR35</option>
          </select>
        </Field>
        <Field label="Working arrangement">
          <select name="remote" className="select" defaultValue={draft.remote}>
            <option value="UNKNOWN">Not stated</option>
            <option value="REMOTE">Remote</option>
            <option value="HYBRID">Hybrid</option>
            <option value="ONSITE">On site</option>
          </select>
        </Field>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <Submit label="Save job" busy="Saving..." />
        <button type="button" className="btn" onClick={onStartAgain}>
          Cancel
        </button>
      </div>
    </form>
  );
}
