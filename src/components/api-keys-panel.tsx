"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import {
  removeCredentialsAction,
  saveCredentialsAction,
  type CredentialState,
} from "@/lib/actions/credentials";
import { Field } from "./ui";

/**
 * Everything the browser is told about a key: whether one is saved and its
 * last four characters. The value itself never comes back from the server.
 */
export type ApiKeyProviderView = {
  id: string;
  displayName: string;
  url: string;
  note?: string;
  fields: { name: string; label: string }[];
  installationConfigured: boolean;
  saved: { hint: string; unreadable: boolean } | null;
};

export function ApiKeysPanel({ providers }: { providers: ApiKeyProviderView[] }) {
  return (
    <section className="card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
      <h2 style={{ margin: "0 0 0.4rem", fontSize: "1.05rem" }}>API keys</h2>
      <p className="muted" style={{ margin: "0 0 1rem", fontSize: "0.9rem" }}>
        Use your own accounts for AI and job search. Keys are encrypted before
        they are stored and are never shown again once saved - only the last
        four characters, so you can tell which one it is.
      </p>
      {providers.map((provider) => (
        <ProviderKey key={provider.id} provider={provider} />
      ))}
    </section>
  );
}

function SaveButton({ replacing }: { replacing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
      {pending ? "Saving..." : replacing ? "Replace key" : "Save key"}
    </button>
  );
}

function ProviderKey({ provider }: { provider: ApiKeyProviderView }) {
  const [state, formAction] = useActionState(saveCredentialsAction, {} as CredentialState);
  const [removal, setRemoval] = useState<CredentialState>({});
  const [removing, startRemoving] = useTransition();
  const saved = provider.saved;
  const [editing, setEditing] = useState(false);
  const showForm = !saved || saved.unreadable || editing;

  return (
    <div
      style={{
        borderTop: "1px solid var(--border)",
        padding: "0.9rem 0",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.8rem", flexWrap: "wrap" }}>
        <strong>{provider.displayName}</strong>
        <Status provider={provider} />
      </div>

      {provider.note && (
        <p className="hint" style={{ margin: "0.3rem 0 0" }}>
          {provider.note}
        </p>
      )}

      {(state.error || removal.error) && (
        <div className="alert alert-error" style={{ margin: "0.7rem 0 0" }}>
          {state.error ?? removal.error}
        </div>
      )}
      {(state.success || removal.success) && (
        <div className="alert alert-success" style={{ margin: "0.7rem 0 0" }}>
          {removal.success ?? state.success}
        </div>
      )}

      {showForm ? (
        <form
          action={(formData) => {
            setRemoval({});
            setEditing(false);
            return formAction(formData);
          }}
          style={{ marginTop: "0.7rem" }}
          autoComplete="off"
        >
          <input type="hidden" name="provider" value={provider.id} />
          {provider.fields.map((field) => (
            <Field key={field.name} label={field.label}>
              <input
                name={field.name}
                aria-label={field.label}
                type="password"
                className="input"
                autoComplete="off"
                spellCheck={false}
                required
              />
            </Field>
          ))}
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <SaveButton replacing={Boolean(saved)} />
            {editing && (
              <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
            <a href={provider.url} target="_blank" rel="noopener noreferrer" className="hint">
              Get a key
            </a>
          </div>
        </form>
      ) : (
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.7rem" }}>
          <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
            Replace
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            disabled={removing}
            onClick={() =>
              startRemoving(async () => {
                setRemoval(await removeCredentialsAction(provider.id));
              })
            }
          >
            {removing ? "Removing..." : "Remove"}
          </button>
        </div>
      )}
    </div>
  );
}

function Status({ provider }: { provider: ApiKeyProviderView }) {
  const saved = provider.saved;
  if (saved?.unreadable) {
    return (
      <span className="badge badge-warning">
        Saved key can no longer be read - enter it again
      </span>
    );
  }
  if (saved) {
    return (
      <span className="badge badge-success">
        Your key{saved.hint ? ` ending ${saved.hint}` : ""}
      </span>
    );
  }
  if (provider.installationConfigured) {
    return <span className="badge">Using this installation&apos;s key</span>;
  }
  return <span className="badge">Not set up</span>;
}
