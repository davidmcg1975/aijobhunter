"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { setAiProviderAction, type CredentialState } from "@/lib/actions/credentials";

export type AiProviderOption = {
  id: string;
  displayName: string;
  /** Whose key this provider would use for this user, if anyone's. */
  key: "own" | "installation" | "none";
};

function Save() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
      {pending ? "Saving..." : "Save choice"}
    </button>
  );
}

const KEY_LABEL: Record<AiProviderOption["key"], string> = {
  own: "your key",
  installation: "this installation's key",
  none: "no key yet - add one below",
};

export function AiProviderChoice({
  preference,
  active,
  options,
}: {
  preference: string | null;
  /** The provider AI calls will actually use right now, or null if none. */
  active: string | null;
  options: AiProviderOption[];
}) {
  const [state, action] = useActionState(setAiProviderAction, {} as CredentialState);
  const activeName = options.find((o) => o.id === active)?.displayName;

  return (
    <section className="card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
      <h2 style={{ margin: "0 0 0.4rem", fontSize: "1.05rem" }}>AI provider</h2>
      <p className="muted" style={{ margin: "0 0 0.9rem", fontSize: "0.9rem" }}>
        Which AI reads your CV and job adverts and drafts your documents. Your
        CV is sent only to the one you choose. Match scores do not depend on
        this - they are calculated here, not by an AI.
      </p>

      {state.error && (
        <div className="alert alert-error" style={{ marginBottom: "0.9rem" }}>{state.error}</div>
      )}
      {state.success && (
        <div className="alert alert-success" style={{ marginBottom: "0.9rem" }}>{state.success}</div>
      )}

      <form action={action}>
        <fieldset style={{ border: 0, padding: 0, margin: "0 0 0.9rem" }}>
          <legend className="label">Use</legend>
          {options.map((option) => (
            <label key={option.id} style={{ display: "block", margin: "0.35rem 0" }}>
              <input
                type="radio"
                name="aiProvider"
                value={option.id}
                defaultChecked={preference === option.id}
              />{" "}
              {option.displayName}{" "}
              <span className="subtle" style={{ fontSize: "0.85rem" }}>
                ({KEY_LABEL[option.key]})
              </span>
            </label>
          ))}
          <label style={{ display: "block", margin: "0.35rem 0" }}>
            <input type="radio" name="aiProvider" value="auto" defaultChecked={!preference} />{" "}
            Automatic{" "}
            <span className="subtle" style={{ fontSize: "0.85rem" }}>
              (whichever you have saved a key for)
            </span>
          </label>
        </fieldset>
        <Save />
      </form>

      <p className="hint" style={{ margin: "0.8rem 0 0" }}>
        {activeName
          ? `AI features are currently using ${activeName}.`
          : "AI features are off until the chosen provider has a key."}
      </p>
    </section>
  );
}
