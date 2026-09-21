import "server-only";
import { getUserCredentials } from "@/lib/credentials/store";
import type { CredentialField } from "@/lib/credentials/fields";

/** The Anthropic key a user may supply instead of the installation's. */
export const ANTHROPIC_CREDENTIAL = {
  id: "anthropic",
  displayName: "Anthropic (AI features)",
  url: "https://console.anthropic.com/settings/keys",
  note:
    "Calls made with your own key are billed to your Anthropic account and " +
    "are not limited by this app's monthly budget. Set a spend limit in the " +
    "Anthropic console.",
  fields: [
    {
      name: "apiKey",
      label: "Anthropic API key",
      pattern: /^sk-ant-[A-Za-z0-9_-]+$/,
      patternMessage: "An Anthropic API key starts with sk-ant-.",
    },
  ] satisfies CredentialField[],
};

export type ResolvedAnthropicKey = { apiKey: string; ownKey: boolean };

/**
 * The user's own key when saved, otherwise the installation's. Calls with no
 * user (background analysis) only ever use the installation's key.
 */
export async function resolveAnthropicKey(
  userId?: string | null,
): Promise<ResolvedAnthropicKey | null> {
  if (userId) {
    const own = await getUserCredentials(userId, ANTHROPIC_CREDENTIAL.id);
    if (own?.apiKey) return { apiKey: own.apiKey, ownKey: true };
  }
  const installation = process.env.ANTHROPIC_API_KEY;
  return installation ? { apiKey: installation, ownKey: false } : null;
}

export async function aiAvailableFor(userId?: string | null): Promise<boolean> {
  return (await resolveAnthropicKey(userId)) !== null;
}
