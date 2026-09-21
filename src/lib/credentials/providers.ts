import "server-only";
import { AI_PROVIDERS, AI_PROVIDER_IDS } from "@/lib/ai/credentials";
import { allSources } from "@/lib/jobsources/registry";
import type { CredentialField } from "./fields";

/** Everything a user can supply their own key for, as the settings page lists it. */
export type CredentialProvider = {
  id: string;
  displayName: string;
  url: string;
  note?: string;
  fields: CredentialField[];
  /** Whether the installation has its own key to fall back on. */
  installationConfigured: boolean;
};

/**
 * Built from the job source registry rather than a list of names, so a new
 * provider appears here by being registered - nothing in this file changes.
 */
export function credentialProviders(): CredentialProvider[] {
  return [
    ...AI_PROVIDER_IDS.map((id) => {
      const { environmentKey, ...provider } = AI_PROVIDERS[id];
      return { ...provider, installationConfigured: Boolean(environmentKey()) };
    }),
    ...allSources().map((source) => ({
      id: source.id,
      displayName: source.displayName,
      url: source.credentialUrl,
      note: source.credentialNote,
      fields: source.credentialFields,
      installationConfigured: source.environmentCredentials() !== null,
    })),
  ];
}

export function getCredentialProvider(id: string): CredentialProvider | undefined {
  return credentialProviders().find((p) => p.id === id);
}
