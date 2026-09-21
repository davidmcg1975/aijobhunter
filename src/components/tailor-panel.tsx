"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  generateCoverLetterAction,
  tailorCvAction,
  type LetterState,
  type TailorState,
} from "@/lib/actions/documents";
import type { GroundingReport } from "@/lib/ai/grounding";

function Pending({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? busy : label}
    </button>
  );
}

/**
 * Surfaces the grounding check. If the AI has introduced anything that is not
 * in the user's own material, the user is told before they send it anywhere -
 * this is the whole point of checking rather than trusting the prompt.
 */
function GroundingNotice({ report }: { report: GroundingReport }) {
  if (report.passed) {
    return (
      <div className="alert alert-success" style={{ marginBottom: "0.9rem" }}>
        Checked against your CV and profile: no invented employers, dates,
        technologies, qualifications or figures.
      </div>
    );
  }

  return (
    <div className="alert alert-error" style={{ marginBottom: "0.9rem" }}>
      <strong>Check this before you send it.</strong>
      <p style={{ margin: "0.4rem 0 0.3rem" }}>
        The generated text contains {report.violations.length} thing
        {report.violations.length === 1 ? "" : "s"} that could not be found in
        your CV or profile:
      </p>
      <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
        {report.violations.map((violation) => (
          <li key={`${violation.kind}-${violation.value}`}>{violation.detail}</li>
        ))}
      </ul>
      <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
        Either remove them, or add them to your profile if they are genuinely
        true.
      </p>
    </div>
  );
}

export function TailorPanel({ jobId }: { jobId: string }) {
  const [state, action] = useActionState(tailorCvAction, {} as TailorState);
  const [view, setView] = useState<"tailored" | "changes" | "compare">("tailored");

  return (
    <div className="card" style={{ padding: "1.1rem" }} id="tailor">
      <h2 style={{ margin: "0 0 0.3rem", fontSize: "1.05rem" }}>Tailor your CV</h2>
      <p className="muted" style={{ margin: "0 0 0.9rem", fontSize: "0.88rem" }}>
        Rewrites emphasis and ordering to suit this advert. Your master CV is
        never changed, and nothing is invented.
      </p>

      {state.error && (
        <div className="alert alert-error" style={{ marginBottom: "0.9rem" }}>
          {state.error}
        </div>
      )}

      <form action={action}>
        <input type="hidden" name="jobId" value={jobId} />
        <Pending label="Tailor CV for this job" busy="Tailoring..." />
      </form>

      {state.result && (
        <div style={{ marginTop: "1.2rem" }}>
          <GroundingNotice report={state.result.grounding} />

          <div className="alert alert-info" style={{ marginBottom: "0.9rem" }}>
            {state.result.keepsFormatting
              ? "This is your own Word document with some paragraphs reworded - your fonts, bullets and layout are unchanged. The preview below is text only; download the Word file to see it as it really looks."
              : "This version is plain text. To keep your CV's own formatting, upload it as a Word document (.docx) - a PDF cannot be edited without losing its layout."}
          </div>

          {state.result.grounding.omissions.length > 0 && (
            <div className="alert alert-info" style={{ marginBottom: "0.9rem" }}>
              These employers from your history do not appear in the tailored
              version: {state.result.grounding.omissions.join(", ")}. That may be
              deliberate condensing, but check it reads as a complete history.
            </div>
          )}

          <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.8rem", flexWrap: "wrap" }}>
            {(["tailored", "changes", "compare"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={view === option ? "btn btn-sm btn-primary" : "btn btn-sm"}
                onClick={() => setView(option)}
              >
                {option === "tailored"
                  ? "Tailored CV"
                  : option === "changes"
                    ? `Changes (${state.result!.changes.length})`
                    : "Compare"}
              </button>
            ))}
            {state.result.keepsFormatting ? (
              <>
                <a
                  href={`/api/cv/${state.result.cvId}/export?format=docx`}
                  className="btn btn-sm btn-primary"
                  title="Your own Word document, with your formatting kept"
                >
                  Download Word (your formatting)
                </a>
                <a
                  href={`/api/cv/${state.result.cvId}/export?format=pdf`}
                  className="btn btn-sm"
                  title="A plain-layout PDF. For your own formatting as a PDF, open the Word file and save it as PDF."
                >
                  PDF (plain layout)
                </a>
              </>
            ) : (
              <>
                <a
                  href={`/api/cv/${state.result.cvId}/export?format=pdf`}
                  className="btn btn-sm"
                >
                  Download PDF
                </a>
                <a
                  href={`/api/cv/${state.result.cvId}/export?format=docx`}
                  className="btn btn-sm"
                >
                  Download DOCX
                </a>
              </>
            )}
          </div>

          {view === "tailored" && (
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontFamily: "inherit",
                fontSize: "0.87rem",
                background: "var(--surface-2)",
                padding: "1rem",
                borderRadius: 8,
                margin: 0,
                maxHeight: 500,
                overflow: "auto",
              }}
            >
              {state.result.tailoredText}
            </pre>
          )}

          {view === "changes" && (
            <div>
              <ul style={{ paddingLeft: "1.1rem", margin: "0 0 1rem" }}>
                {state.result.changes.map((change, index) => (
                  <li key={index} style={{ marginBottom: "0.4rem" }}>
                    <strong style={{ fontWeight: 580 }}>{change.change}</strong>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      {change.reason}
                    </div>
                  </li>
                ))}
              </ul>

              {state.result.omittedRequirements.length > 0 && (
                <>
                  <h3 style={{ fontSize: "0.92rem", margin: "0 0 0.4rem" }}>
                    Requirements your CV does not evidence
                  </h3>
                  <ul className="muted" style={{ paddingLeft: "1.1rem", margin: 0, fontSize: "0.87rem" }}>
                    {state.result.omittedRequirements.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <p className="hint">
                    These were deliberately left out rather than invented.
                  </p>
                </>
              )}
            </div>
          )}

          {view === "compare" && (
            <div
              style={{
                background: "var(--surface-2)",
                padding: "1rem",
                borderRadius: 8,
                fontSize: "0.85rem",
                maxHeight: 500,
                overflow: "auto",
              }}
            >
              {state.result.diff.map((line, index) => (
                <div
                  key={index}
                  style={{
                    padding: "0.1rem 0.35rem",
                    borderLeft: `3px solid ${
                      line.kind === "added"
                        ? "var(--success)"
                        : line.kind === "removed"
                          ? "var(--danger)"
                          : "transparent"
                    }`,
                    background:
                      line.kind === "added"
                        ? "var(--success-soft)"
                        : line.kind === "removed"
                          ? "var(--danger-soft)"
                          : "transparent",
                    opacity: line.kind === "unchanged" ? 0.65 : 1,
                    marginBottom: 1,
                  }}
                >
                  <span className="subtle" style={{ userSelect: "none" }}>
                    {line.kind === "added" ? "+ " : line.kind === "removed" ? "− " : "  "}
                  </span>
                  {line.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CoverLetterPanel({ jobId }: { jobId: string }) {
  const [state, action] = useActionState(
    generateCoverLetterAction,
    {} as LetterState,
  );
  const [copied, setCopied] = useState(false);

  return (
    <div className="card" style={{ padding: "1.1rem" }} id="cover-letter">
      <h2 style={{ margin: "0 0 0.3rem", fontSize: "1.05rem" }}>Cover letter</h2>
      <p className="muted" style={{ margin: "0 0 0.9rem", fontSize: "0.88rem" }}>
        Written from your genuine experience only. Review it before sending -
        nothing is sent for you.
      </p>

      {state.error && (
        <div className="alert alert-error" style={{ marginBottom: "0.9rem" }}>
          {state.error}
        </div>
      )}

      <form action={action} style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "end" }}>
        <input type="hidden" name="jobId" value={jobId} />
        <div style={{ minWidth: 160 }}>
          <label className="label" htmlFor="tone">
            Tone
          </label>
          <select id="tone" name="tone" className="select" defaultValue="Professional">
            <option>Professional</option>
            <option>Formal</option>
            <option>Concise</option>
            <option>Enthusiastic</option>
          </select>
        </div>
        <Pending label="Generate letter" busy="Writing..." />
      </form>

      {state.content && (
        <div style={{ marginTop: "1.1rem" }}>
          {state.grounding && <GroundingNotice report={state.grounding} />}
          <textarea
            className="textarea"
            defaultValue={state.content}
            rows={14}
            style={{ fontFamily: "inherit" }}
          />
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: "0.6rem" }}
            onClick={() => {
              navigator.clipboard.writeText(state.content ?? "").then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
          >
            {copied ? "Copied" : "Copy to clipboard"}
          </button>
        </div>
      )}
    </div>
  );
}
