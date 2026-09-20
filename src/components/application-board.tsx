"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import {
  deleteApplicationAction,
  updateApplicationAction,
  updateApplicationStatusAction,
  type ApplicationState,
} from "@/lib/actions/applications";
import {
  CLOSED_STATUSES,
  PIPELINE_STATUSES,
  STATUS_LABELS,
  formatDate,
  formatRate,
} from "@/lib/format";
import { Field } from "./ui";

export type ApplicationRow = {
  id: string;
  status: string;
  appliedAt: Date | null;
  nextFollowUpAt: Date | null;
  recruiterName: string | null;
  recruiterEmail: string | null;
  recruiterPhone: string | null;
  agency: string | null;
  agreedRate: number | null;
  ir35: string;
  notes: string | null;
  cvId: string | null;
  job: {
    id: string;
    title: string;
    company: string | null;
    location: string | null;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryPeriod: string;
  };
};

const ALL_STATUSES = [...PIPELINE_STATUSES, ...CLOSED_STATUSES];

export function ApplicationBoard({
  applications,
  cvs,
}: {
  applications: ApplicationRow[];
  cvs: Array<{ id: string; name: string }>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const byStatus = (status: string) =>
    applications.filter((a) => a.status === status);

  const closed = applications.filter((a) =>
    (CLOSED_STATUSES as readonly string[]).includes(a.status),
  );

  return (
    <div>
      {message && (
        <div className="alert alert-success" style={{ marginBottom: "1rem" }}>
          {message}
        </div>
      )}

      {/* Columns scroll horizontally rather than forcing the page to. */}
      <div className="scroll-x" style={{ paddingBottom: "0.5rem" }}>
        <div
          style={{
            display: "grid",
            gridAutoFlow: "column",
            gridAutoColumns: "minmax(250px, 1fr)",
            gap: "0.8rem",
            minWidth: "min-content",
          }}
        >
          {PIPELINE_STATUSES.map((status) => {
            const items = byStatus(status);
            return (
              <section key={status}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.5rem",
                    padding: "0 0.15rem",
                  }}
                >
                  <h2 style={{ fontSize: "0.87rem", margin: 0, fontWeight: 650 }}>
                    {STATUS_LABELS[status]}
                  </h2>
                  <span className="badge">{items.length}</span>
                </div>

                <div className="stack" style={{ gap: "0.5rem" }}>
                  {items.map((application) => (
                    <Card
                      key={application.id}
                      application={application}
                      pending={pending}
                      onMove={(next) =>
                        startTransition(async () => {
                          const result = await updateApplicationStatusAction(
                            application.id,
                            next,
                          );
                          setMessage(result.success ?? result.error ?? null);
                        })
                      }
                      onExpand={() =>
                        setExpanded(expanded === application.id ? null : application.id)
                      }
                      expanded={expanded === application.id}
                      cvs={cvs}
                      onDelete={() =>
                        startTransition(async () => {
                          const result = await deleteApplicationAction(application.id);
                          setMessage(result.success ?? result.error ?? null);
                        })
                      }
                    />
                  ))}
                  {items.length === 0 && (
                    <p className="subtle" style={{ fontSize: "0.82rem", padding: "0.4rem 0.15rem" }}>
                      Nothing here
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {closed.length > 0 && (
        <details style={{ marginTop: "1.6rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 620 }}>
            Closed ({closed.length})
          </summary>
          <div className="stack" style={{ gap: "0.5rem", marginTop: "0.8rem" }}>
            {closed.map((application) => (
              <div
                key={application.id}
                className="card"
                style={{
                  padding: "0.8rem 0.9rem",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  flexWrap: "wrap",
                  opacity: 0.8,
                }}
              >
                <div>
                  <Link href={`/jobs/${application.job.id}`} style={{ fontWeight: 600 }}>
                    {application.job.title}
                  </Link>
                  <div className="muted" style={{ fontSize: "0.84rem" }}>
                    {application.job.company} · {STATUS_LABELS[application.status]}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await updateApplicationStatusAction(application.id, "CONSIDERING");
                    })
                  }
                >
                  Reopen
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function Card({
  application,
  expanded,
  pending,
  cvs,
  onMove,
  onExpand,
  onDelete,
}: {
  application: ApplicationRow;
  expanded: boolean;
  pending: boolean;
  cvs: Array<{ id: string; name: string }>;
  onMove: (status: string) => void;
  onExpand: () => void;
  onDelete: () => void;
}) {
  const [state, action] = useActionState(
    updateApplicationAction,
    {} as ApplicationState,
  );

  const overdue =
    application.nextFollowUpAt && application.nextFollowUpAt <= new Date();

  return (
    <article className="card" style={{ padding: "0.75rem 0.85rem" }}>
      <Link
        href={`/jobs/${application.job.id}`}
        style={{ fontWeight: 620, fontSize: "0.92rem", textDecoration: "none" }}
      >
        {application.job.title}
      </Link>
      {application.job.company && (
        <div className="muted" style={{ fontSize: "0.82rem" }}>
          {application.job.company}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", margin: "0.5rem 0" }}>
        <span className="badge">
          {application.agreedRate
            ? `£${application.agreedRate}/day`
            : formatRate(
                application.job.salaryMin,
                application.job.salaryMax,
                application.job.salaryPeriod,
              )}
        </span>
        {overdue && <span className="badge badge-warning">Follow up</span>}
      </div>

      {application.appliedAt && (
        <div className="subtle" style={{ fontSize: "0.78rem" }}>
          Applied {formatDate(application.appliedAt)}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
        <select
          className="select"
          value={application.status}
          disabled={pending}
          onChange={(event) => onMove(event.target.value)}
          style={{ fontSize: "0.8rem", padding: "0.25rem 0.4rem", width: "auto", flex: 1 }}
          aria-label="Move to status"
        >
          {ALL_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-sm" onClick={onExpand}>
          {expanded ? "Close" : "Details"}
        </button>
      </div>

      {expanded && (
        <form action={action} style={{ marginTop: "0.8rem" }}>
          <input type="hidden" name="id" value={application.id} />

          {state.error && <div className="alert alert-error">{state.error}</div>}
          {state.success && <div className="alert alert-success">{state.success}</div>}

          <Field label="Recruiter">
            <input name="recruiterName" className="input" defaultValue={application.recruiterName ?? ""} />
          </Field>
          <Field label="Recruiter email">
            <input name="recruiterEmail" type="email" className="input" defaultValue={application.recruiterEmail ?? ""} />
          </Field>
          <Field label="Agency">
            <input name="agency" className="input" defaultValue={application.agency ?? ""} />
          </Field>
          <Field label="Agreed rate (£/day)">
            <input name="agreedRate" type="number" className="input" defaultValue={application.agreedRate ?? ""} />
          </Field>
          <Field label="IR35">
            <select name="ir35" className="select" defaultValue={application.ir35}>
              <option value="UNKNOWN">Not stated</option>
              <option value="OUTSIDE">Outside</option>
              <option value="INSIDE">Inside</option>
            </select>
          </Field>
          <Field label="CV used">
            <select name="cvId" className="select" defaultValue={application.cvId ?? ""}>
              <option value="">Not recorded</option>
              {cvs.map((cv) => (
                <option key={cv.id} value={cv.id}>
                  {cv.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Next follow-up">
            <input
              name="nextFollowUpAt"
              type="date"
              className="input"
              defaultValue={
                application.nextFollowUpAt
                  ? application.nextFollowUpAt.toISOString().slice(0, 10)
                  : ""
              }
            />
          </Field>
          <Field label="Notes">
            <textarea name="notes" className="textarea" defaultValue={application.notes ?? ""} />
          </Field>

          <div style={{ display: "flex", gap: "0.4rem" }}>
            <SaveDetails />
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => {
                if (confirm("Remove this application from your tracker?")) onDelete();
              }}
            >
              Remove
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

function SaveDetails() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>
      {pending ? "Saving..." : "Save"}
    </button>
  );
}
