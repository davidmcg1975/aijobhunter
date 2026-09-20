import { requireUser } from "@/lib/auth/session";
import { Container, PageHeader } from "@/components/ui";
import {
  ChangePassword,
  DataExport,
  DeleteAccount,
  EmailVerification,
  RescoreJobs,
} from "@/components/settings-panels";
import { sourceStatus } from "@/lib/jobsources/registry";
import { features } from "@/lib/env";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const sources = sourceStatus();

  return (
    <Container width={720}>
      <PageHeader title="Settings" description={user.email} />

      <EmailVerification verified={Boolean(user.emailVerified)} />
      <RescoreJobs />
      <ChangePassword />

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
            {features.ai() ? (
              <span style={{ color: "var(--success)" }}>connected</span>
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
          Your CV text and structured profile are sent to Anthropic&apos;s API to
          analyse job adverts, score matches and draft documents. They are not
          used to train models. Job adverts are fetched from the sources listed
          above.
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
