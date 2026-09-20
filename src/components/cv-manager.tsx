"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import {
  confirmExtractionAction,
  deleteCvAction,
  setMasterCvAction,
  uploadCvAction,
  type CvUploadState,
} from "@/lib/actions/cv";
import { formatDate } from "@/lib/format";

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? busy : label}
    </button>
  );
}

export function CvUpload({ hasMaster }: { hasMaster: boolean }) {
  const [state, action] = useActionState(uploadCvAction, {} as CvUploadState);
  const [confirmState, confirmAction] = useActionState(confirmExtractionAction, {});

  return (
    <div className="card" style={{ padding: "1.2rem" }}>
      <h2 style={{ margin: "0 0 0.3rem", fontSize: "1.05rem" }}>Upload a CV</h2>
      <p className="muted" style={{ margin: "0 0 1rem", fontSize: "0.88rem" }}>
        PDF or Word (.docx), up to 10 MB. Scanned or image-only CVs cannot be
        read - the text has to be selectable.
      </p>

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
        <div style={{ marginBottom: "0.9rem" }}>
          <label className="label" htmlFor="file">
            CV file
          </label>
          <input
            id="file"
            name="file"
            type="file"
            className="input"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            required
          />
        </div>
        <div style={{ marginBottom: "0.9rem" }}>
          <label className="label" htmlFor="name">
            Name this version
          </label>
          <input
            id="name"
            name="name"
            className="input"
            placeholder="Master CV"
          />
        </div>
        <label
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
            fontSize: "0.88rem",
            marginBottom: "0.9rem",
          }}
        >
          <input type="checkbox" name="isMaster" defaultChecked={!hasMaster} />
          <span>
            Make this my master CV
            {hasMaster && (
              <span className="subtle"> (replaces the current master)</span>
            )}
          </span>
        </label>
        <Submit label="Upload CV" busy="Reading your CV..." />
      </form>

      {state.extraction && (
        <div style={{ marginTop: "1.4rem", paddingTop: "1.2rem", borderTop: "1px solid var(--border)" }}>
          <h3 style={{ margin: "0 0 0.3rem", fontSize: "1rem" }}>
            What was found in your CV
          </h3>
          <p className="muted" style={{ margin: "0 0 0.9rem", fontSize: "0.87rem" }}>
            Nothing has been added to your profile yet. Check this is accurate -
            it becomes the source of truth for every match and tailored CV.
          </p>

          {confirmState.error && (
            <div className="alert alert-error" style={{ marginBottom: "0.9rem" }}>
              {confirmState.error}
            </div>
          )}
          {confirmState.success && (
            <div className="alert alert-success" style={{ marginBottom: "0.9rem" }}>
              {confirmState.success}
            </div>
          )}

          <ExtractionSummary extraction={state.extraction} />

          <form action={confirmAction} style={{ marginTop: "1rem" }}>
            <input type="hidden" name="cvId" value={state.cvId} />
            <label
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                fontSize: "0.88rem",
                marginBottom: "0.8rem",
              }}
            >
              <input type="checkbox" name="replaceExperience" defaultChecked />
              <span>
                Also add the employment history
                <span className="subtle"> (roles you typed yourself are kept)</span>
              </span>
            </label>
            <Submit label="Add this to my profile" busy="Updating profile..." />
          </form>
        </div>
      )}
    </div>
  );
}

function ExtractionSummary({
  extraction,
}: {
  extraction: NonNullable<CvUploadState["extraction"]>;
}) {
  const groups: Array<[string, string[]]> = [
    ["Technologies", extraction.technologies],
    ["Testing methodologies", extraction.testingMethodologies],
    ["AI / LLM testing", extraction.aiTestingSkills],
    ["Industries", extraction.industries],
    ["Certifications", extraction.certifications],
    ["Qualifications", extraction.qualifications],
    ["Job titles", extraction.jobTitles],
  ];

  return (
    <div>
      {extraction.yearsExperience !== null && (
        <p style={{ margin: "0 0 0.6rem", fontSize: "0.9rem" }}>
          <strong>Years of experience:</strong> {extraction.yearsExperience}
        </p>
      )}

      {groups
        .filter(([, values]) => values.length > 0)
        .map(([label, values]) => (
          <div key={label} style={{ marginBottom: "0.7rem" }}>
            <div className="label" style={{ marginBottom: "0.25rem" }}>
              {label}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
              {values.map((value) => (
                <span key={value} className="badge">
                  {value}
                </span>
              ))}
            </div>
          </div>
        ))}

      {extraction.experiences.length > 0 && (
        <div style={{ marginTop: "0.9rem" }}>
          <div className="label">Employment history</div>
          {extraction.experiences.some((e) => !e.startDate) && (
            <p className="hint" style={{ marginTop: 0, marginBottom: "0.4rem" }}>
              {extraction.experiences.filter((e) => !e.startDate).length} of{" "}
              {extraction.experiences.length} roles have no date in your CV.
              They are still imported - no dates are guessed - and you can fill
              them in on your profile.
            </p>
          )}
          <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.88rem" }}>
            {extraction.experiences.map((exp, index) => (
              <li key={index}>
                <strong style={{ fontWeight: 580 }}>{exp.jobTitle}</strong>,{" "}
                {exp.company}
                <span className="subtle">
                  {" "}
                  ({exp.startDate ?? "?"} to {exp.isCurrent ? "present" : (exp.endDate ?? "?")})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * The extraction review, for a CV whose structured data has been stored but
 * not yet confirmed into the profile.
 *
 * Without this the confirmation step existed only in the post-upload action
 * state: navigating away lost it, and the only route back was to re-upload and
 * pay for the extraction a second time.
 */
export function ExtractionReview({
  cvId,
  extraction,
}: {
  cvId: string;
  extraction: NonNullable<CvUploadState["extraction"]>;
}) {
  const [state, action] = useActionState(confirmExtractionAction, {});
  const [open, setOpen] = useState(false);

  return (
    <div className="card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
      <h2 style={{ margin: "0 0 0.3rem", fontSize: "1.05rem" }}>
        Review what was found in your CV
      </h2>
      <p className="muted" style={{ margin: "0 0 0.9rem", fontSize: "0.88rem" }}>
        Your CV has been read but not yet added to your profile. The profile is
        what every match score and tailored CV is built from.
      </p>

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

      <button
        type="button"
        className="btn btn-sm"
        onClick={() => setOpen((value) => !value)}
        style={{ marginBottom: open ? "1rem" : 0 }}
      >
        {open
          ? "Hide details"
          : `Show what was found (${extraction.experiences.length} roles)`}
      </button>

      {open && <ExtractionSummary extraction={extraction} />}

      <form action={action} style={{ marginTop: "1rem" }}>
        <input type="hidden" name="cvId" value={cvId} />
        <label
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
            fontSize: "0.88rem",
            marginBottom: "0.8rem",
          }}
        >
          <input type="checkbox" name="replaceExperience" defaultChecked />
          <span>
            Also add the employment history
            <span className="subtle"> (roles you typed yourself are kept)</span>
          </span>
        </label>
        <Submit label="Add this to my profile" busy="Updating profile..." />
      </form>
    </div>
  );
}

type CvRow = {
  id: string;
  name: string;
  isMaster: boolean;
  kind: string;
  fileName: string | null;
  createdAt: Date;
  jobTitle: string | null;
};

export function CvList({ cvs }: { cvs: CvRow[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="stack" style={{ gap: "0.7rem" }}>
      {error && <div className="alert alert-error">{error}</div>}

      {cvs.map((cv) => (
        <div
          key={cv.id}
          className="card"
          style={{
            padding: "0.9rem 1rem",
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <strong>{cv.name}</strong>
            {cv.isMaster && (
              <span className="badge badge-accent" style={{ marginLeft: "0.5rem" }}>
                Master
              </span>
            )}
            <div className="muted" style={{ fontSize: "0.84rem" }}>
              {cv.jobTitle ? `Tailored for ${cv.jobTitle}` : cv.fileName}
              {" · "}
              {formatDate(cv.createdAt)}
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            <a href={`/api/cv/${cv.id}/export?format=pdf`} className="btn btn-sm">
              PDF
            </a>
            <a href={`/api/cv/${cv.id}/export?format=docx`} className="btn btn-sm">
              DOCX
            </a>
            {!cv.isMaster && (
              <button
                type="button"
                className="btn btn-sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await setMasterCvAction(cv.id);
                    setError(result.error ?? null);
                  })
                }
              >
                Make master
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm btn-danger"
              disabled={pending}
              onClick={() => {
                if (
                  !confirm(
                    `Delete "${cv.name}"? This permanently removes the file and its text.`,
                  )
                ) {
                  return;
                }
                startTransition(async () => {
                  const result = await deleteCvAction(cv.id);
                  setError(result.error ?? null);
                });
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
