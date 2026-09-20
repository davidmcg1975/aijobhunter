"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  loginAction,
  registerAction,
  requestPasswordResetAction,
  resetPasswordAction,
  type FormState,
} from "@/lib/auth/actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-primary"
      disabled={pending}
      style={{ width: "100%", marginTop: "0.4rem" }}
    >
      {pending ? "Please wait..." : label}
    </button>
  );
}

function Messages({ state }: { state: FormState }) {
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

export function LoginForm({ justReset }: { justReset: boolean }) {
  const [state, action] = useActionState(loginAction, {} as FormState);

  return (
    <div className="card" style={{ padding: "1.5rem" }}>
      <h2 style={{ margin: "0 0 1rem", fontSize: "1.1rem" }}>Sign in</h2>
      {justReset && (
        <div className="alert alert-success" style={{ marginBottom: "0.9rem" }}>
          Your password has been changed. Sign in with your new password.
        </div>
      )}
      <Messages state={state} />
      <form action={action}>
        <div style={{ marginBottom: "0.9rem" }}>
          <label className="label" htmlFor="email">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="input"
            autoComplete="email"
            required
          />
        </div>
        <div style={{ marginBottom: "0.9rem" }}>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            autoComplete="current-password"
            required
          />
        </div>
        <Submit label="Sign in" />
      </form>
      <p style={{ marginTop: "1rem", fontSize: "0.87rem" }} className="muted">
        <Link href="/forgot-password">Forgotten your password?</Link>
        {" · "}
        <Link href="/register">Create an account</Link>
      </p>
    </div>
  );
}

export function RegisterForm({ inviteOnly = false }: { inviteOnly?: boolean }) {
  const [state, action] = useActionState(registerAction, {} as FormState);

  return (
    <div className="card" style={{ padding: "1.5rem" }}>
      <h2 style={{ margin: "0 0 1rem", fontSize: "1.1rem" }}>Create an account</h2>
      {inviteOnly && (
        <p className="muted" style={{ margin: "-0.4rem 0 1rem", fontSize: "0.87rem" }}>
          This application is invite-only. Use the email address it was set up
          for, and choose your own password.
        </p>
      )}
      <Messages state={state} />
      <form action={action}>
        <div style={{ marginBottom: "0.9rem" }}>
          <label className="label" htmlFor="name">
            Your name
          </label>
          <input id="name" name="name" className="input" autoComplete="name" required />
        </div>
        <div style={{ marginBottom: "0.9rem" }}>
          <label className="label" htmlFor="email">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="input"
            autoComplete="email"
            required
          />
        </div>
        <div style={{ marginBottom: "0.9rem" }}>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            autoComplete="new-password"
            minLength={12}
            required
          />
          <p className="hint">
            At least 12 characters. A memorable phrase of three or four words is
            stronger than a short complicated one.
          </p>
        </div>
        <label
          style={{
            display: "flex",
            gap: "0.55rem",
            alignItems: "flex-start",
            fontSize: "0.86rem",
            marginBottom: "0.6rem",
          }}
        >
          <input type="checkbox" name="acceptTerms" required style={{ marginTop: 3 }} />
          <span className="muted">
            I accept the <Link href="/terms">terms of service</Link> and{" "}
            <Link href="/privacy">privacy policy</Link>, and I understand my CV
            and profile are sent to an AI provider to analyse jobs and tailor
            applications.
          </span>
        </label>
        <Submit label="Create account" />
      </form>
      <p style={{ marginTop: "1rem", fontSize: "0.87rem" }} className="muted">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(
    requestPasswordResetAction,
    {} as FormState,
  );

  return (
    <div className="card" style={{ padding: "1.5rem" }}>
      <h2 style={{ margin: "0 0 1rem", fontSize: "1.1rem" }}>Reset your password</h2>
      <Messages state={state} />
      {!state.success && (
        <form action={action}>
          <div style={{ marginBottom: "0.9rem" }}>
            <label className="label" htmlFor="email">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              autoComplete="email"
              required
            />
          </div>
          <Submit label="Send reset link" />
        </form>
      )}
      <p style={{ marginTop: "1rem", fontSize: "0.87rem" }} className="muted">
        <Link href="/login">Back to sign in</Link>
      </p>
    </div>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, {} as FormState);

  return (
    <div className="card" style={{ padding: "1.5rem" }}>
      <h2 style={{ margin: "0 0 1rem", fontSize: "1.1rem" }}>Choose a new password</h2>
      <Messages state={state} />
      <form action={action}>
        <input type="hidden" name="token" value={token} />
        <div style={{ marginBottom: "0.9rem" }}>
          <label className="label" htmlFor="password">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            autoComplete="new-password"
            minLength={12}
            required
          />
          <p className="hint">At least 12 characters.</p>
        </div>
        <Submit label="Change password" />
      </form>
    </div>
  );
}
