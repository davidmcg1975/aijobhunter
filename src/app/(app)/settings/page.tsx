import { requireUser } from "@/lib/auth/session";
import { Container, PageHeader } from "@/components/ui";
import {
  ChangePassword,
  DataExport,
  DeleteAccount,
  EmailVerification,
  RescoreJobs,
} from "@/components/settings-panels";
import { ApiKeysPanel, type ApiKeyProviderView } from "@/components/api-keys-panel";
import { sourceStatusFor } from "@/lib/jobsources/credentials";
import { AI_PROVIDERS, AI_PROVIDER_IDS, getAiPreference, resolveAi } from "@/lib/ai/credentials";
import { AiProviderChoice, type AiProviderOption } from "@/components/ai-provider-choice";
import { credentialProviders } from "@/lib/credentials/providers";
import { listUserCredentialStatus } from "@/lib/credentials/store";
import { features } from "@/lib/env";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const [sources, activeAi, aiPreference, savedKeys] = await Promise.all([
    sourceStatusFor(user.id),
    resolveAi(user.id),
    getAiPreference(user.id),
    listUserCredentialStatus(user.id),
  ]);
  const aiAvailable = activeAi !== null;
  const aiName = activeAi ? AI_PROVIDERS[activeAi.provider].displayName : null;

  const aiOptions: AiProviderOption[] = AI_PROVIDER_IDS.map((id) => {
    const own = savedKeys.some((k) => k.provider === id && !k.unreadable);
    return {
      id,
      displayName: AI_PROVIDERS[id].displayName,
      key: own ? "own" : AI_PROVIDERS[id].environmentKey() ? "installation" : "none",
    };
  });

  // Only what the browser needs to render the form. Field patterns stay on
  // the server, where validation happens, and no key value is ever included.
  const keyProviders: ApiKeyProviderView[] = credentialProviders().map((provider) => {
    const saved = savedKeys.find((k) => k.provider === provider.id);
    return {
      id: provider.id,
      displayName: provider.displayName,
      url: provider.url,
      note: provider.note,
      fields: provider.fields.map(({ name, label }) => ({ name, label })),
      installationConfigured: provider.installationConfigured,
      saved: saved ? { hint: saved.hint, unreadable: saved.unreadable } : null,
    };
  });

  return (
    <Container width={720}>
      <PageHeader title="Settings" description={user.email} />

      <EmailVerification
        verified={Boolean(user.emailVerified)}
        emailEnabled={features.email()}
      />
      <RescoreJobs />
      <ChangePassword />
      <AiProviderChoice
        preference={aiPreference}
        active={activeAi?.provider ?? null}
        options={aiOptions}
      />
      <ApiKeysPanel providers={keyProviders} />

      <section className="card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.05rem" }}>
          What is connected
        </h2>
        <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.9rem" }}>
          {sources.map((source) => (
            <li key={source.id}>
              {source.displayName}:{" "}
              {source.configured ? (
                <span style={{ color: "var(--success)" }}>connected</span>
              ) : (
                <span className="subtle">not configured</span>
              )}
            </li>
          ))}
          <li>
            AI features:{" "}
            {aiAvailable ? (
              <span style={{ color: "var(--success)" }}>connected ({aiName})</span>
            ) : (
              <span className="subtle">not configured</span>
            )}
          </li>
          <li>
            Email:{" "}
            {features.email() ? (
              <span style={{ color: "var(--success)" }}>connected</span>
            ) : (
              <span className="subtle">not configured - links are written to the server log</span>
            )}
          </li>
        </ul>
      </section>

      <section className="card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.05rem" }}>
          How your data is processed
        </h2>
        <p className="muted" style={{ margin: "0 0 0.6rem", fontSize: "0.9rem" }}>
          Your CV text and structured profile are sent to{" "}
          {aiName ?? "the AI provider you choose above"} to read your CV, analyse
          job adverts and draft documents - and only to that provider. Neither
          Anthropic nor OpenAI uses API data to train models by default. Job
          adverts are fetched from the sources listed above.
        </p>
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          Match scores themselves are calculated on this server, not by an AI
          model, so they are reproducible and auditable.
        </p>
      </section>

      <DataExport />
      <DeleteAccount />
    </Container>
  );
}
