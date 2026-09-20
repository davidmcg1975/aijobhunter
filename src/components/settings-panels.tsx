"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import {
  changePasswordAction,
  deleteAccountAction,
  exportDataAction,
  resendVerificationAction,
  type AccountState,
} from "@/lib/actions/account";
import { rescoreAllAction } from "@/lib/actions/jobs";
import { Field } from "./ui";

function Submit({ label, busy, danger }: { label: string; busy: string; danger?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={danger ? "btn btn-danger" : "btn btn-primary"}
      disabled={pending}
    >
      {pending ? busy : label}
    </button>
  );
}

function Messages({ state }: { state: AccountState }) {
  return (
    <>
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
    </>
  );
}

export function ChangePassword() {
  const [state, action] = useActionState(changePasswordAction, {} as AccountState);

  return (
    <section className="card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
      <h2 style={{ margin: "0 0 0.9rem", fontSize: "1.05rem" }}>Change password</h2>
      <Messages state={state} />
      <form action={action}>
        <Field label="Current password">
          <input name="currentPassword" type="password" className="input" autoComplete="current-password" required />
        </Field>
        <Field label="New password" hint="At least 12 characters">
          <input name="newPassword" type="password" className="input" autoComplete="new-password" minLength={12} required />
        </Field>
        <Submit label="Change password" busy="Changing..." />
      </form>
    </section>
  );
}

export function EmailVerification({ verified }: { verified: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (verified) {
    return (
      <section className="card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.05rem" }}>Email address</h2>
        <p className="muted" style={{ margin: 0 }}>
          Your email address is confirmed.
        </p>
      </section>
    );
  }

  return (
    <section className="card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.05rem" }}>Email address</h2>
      <p className="muted" style={{ margin: "0 0 0.8rem" }}>
        Your email address is not confirmed yet. Confirming it enables reminders
        and job alerts.
      </p>
      {message && <div className="alert alert-success" style={{ marginBottom: "0.8rem" }}>{message}</div>}
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await resendVerificationAction();
            setMessage(result.success ?? result.error ?? null);
          })
        }
      >
        {pending ? "Sending..." : "Resend confirmation email"}
      </button>
    </section>
  );
}

export function RescoreJobs() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section className="card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.05rem" }}>Re-score jobs</h2>
      <p className="muted" style={{ margin: "0 0 0.8rem" }}>
        Match scores are calculated against your profile as it was at the time.
        Re-score after changing your profile or uploading a new CV.
      </p>
      {message && <div className="alert alert-success" style={{ marginBottom: "0.8rem" }}>{message}</div>}
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await rescoreAllAction();
            setMessage(result.success ?? result.error ?? null);
          })
        }
      >
        {pending ? "Re-scoring..." : "Re-score all jobs"}
      </button>
    </section>
  );
}

export function DataExport() {
  const [pending, startTransition] = useTransition();

  return (
    <section className="card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.05rem" }}>
        Download your data
      </h2>
      <p className="muted" style={{ margin: "0 0 0.8rem" }}>
        Everything held about you - profile, employment history, CVs,
        applications and generated documents - as a JSON file.
      </p>
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const { data } = await exportDataAction();
            const blob = new Blob([data], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `contract-hunter-export-${new Date()
              .toISOString()
              .slice(0, 10)}.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
          })
        }
      >
        {pending ? "Preparing..." : "Download my data"}
      </button>
    </section>
  );
}

export function DeleteAccount() {
  const [state, action] = useActionState(deleteAccountAction, {} as AccountState);
  const [open, setOpen] = useState(false);

  return (
    <section
      className="card"
      style={{ padding: "1.2rem", borderColor: "var(--danger)" }}
    >
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.05rem", color: "var(--danger)" }}>
        Delete your account
      </h2>
      <p className="muted" style={{ margin: "0 0 0.8rem" }}>
        Permanently removes your account, profile, CVs, applications and every
        generated document. This cannot be undone.
      </p>

      <Messages state={state} />

      {!open ? (
        <button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>
          Delete my account
        </button>
      ) : (
        <form action={action}>
          <Field label="Your password">
            <input name="password" type="password" className="input" autoComplete="current-password" required />
          </Field>
          <Field label="Type DELETE to confirm">
            <input name="confirmation" className="input" placeholder="DELETE" required />
          </Field>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Submit label="Permanently delete" busy="Deleting..." danger />
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
