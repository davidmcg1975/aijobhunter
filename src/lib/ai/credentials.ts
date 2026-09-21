import "server-only";
import { prisma } from "@/lib/db";
import { getUserCredentials } from "@/lib/credentials/store";
import type { CredentialField } from "@/lib/credentials/fields";
import type { AiProviderId } from "./provider";

type AiCredentialDefinition = {
  id: AiProviderId;
  /** What users know it as. */
  displayName: string;
  url: string;
  note: string;
  fields: CredentialField[];
  environmentKey: () => string | undefined;
};

export const AI_PROVIDERS: Record<AiProviderId, AiCredentialDefinition> = {
  anthropic: {
    id: "anthropic",
    displayName: "Claude (Anthropic)",
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
    ],
    environmentKey: () => process.env.ANTHROPIC_API_KEY,
  },
  openai: {
    id: "openai",
    displayName: "ChatGPT (OpenAI)",
    url: "https://platform.openai.com/api-keys",
    note:
      "This is an OpenAI API key, which is separate from a ChatGPT Plus " +
      "subscription and billed per use. Calls made with your own key are not " +
      "limited by this app's monthly budget. Set a limit in OpenAI's billing " +
      "settings.",
    fields: [
      {
        name: "apiKey",
        label: "OpenAI API key",
        // sk-proj-..., sk-svcacct-... or a legacy sk-... - but not an
        // Anthropic key pasted into the wrong box, which also starts "sk-".
        pattern: /^sk-(?!ant-)[A-Za-z0-9_-]+$/,
        patternMessage:
          "An OpenAI API key starts with sk- (an sk-ant- key belongs in the Claude box).",
      },
    ],
    environmentKey: () => process.env.OPENAI_API_KEY,
  },
};

export const AI_PROVIDER_IDS = Object.keys(AI_PROVIDERS) as AiProviderId[];

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === "string" && value in AI_PROVIDERS;
}

export type AvailableKeys = Record<AiProviderId, { own?: string; installation?: string }>;

export type ResolvedAi = { provider: AiProviderId; apiKey: string; ownKey: boolean };

/**
 * Which provider and key a call uses. Pure, so the rules are tested:
 *
 *  - An explicit choice is binding. With no key for that provider, AI is
 *    unavailable - it never quietly switches, because the choice decides
 *    which company receives the user's CV.
 *  - With no choice made, the user's own key wins over the installation's,
 *    so someone who has only saved an OpenAI key gets ChatGPT without having
 *    to find the setting.
 */
export function chooseAi(
  preference: AiProviderId | null,
  keys: AvailableKeys,
): ResolvedAi | null {
  if (preference) {
    const { own, installation } = keys[preference];
    if (own) return { provider: preference, apiKey: own, ownKey: true };
    if (installation) return { provider: preference, apiKey: installation, ownKey: false };
    return null;
  }
  for (const provider of AI_PROVIDER_IDS) {
    const own = keys[provider].own;
    if (own) return { provider, apiKey: own, ownKey: true };
  }
  for (const provider of AI_PROVIDER_IDS) {
    const installation = keys[provider].installation;
    if (installation) return { provider, apiKey: installation, ownKey: false };
  }
  return null;
}

export async function getAiPreference(userId: string): Promise<AiProviderId | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: { aiProvider: true },
  });
  return isAiProviderId(user?.aiProvider) ? user.aiProvider : null;
}

/**
 * Calls with no user (background analysis) only ever use installation keys:
 * a user's key is spent on that user's own requests and nothing else.
 */
export async function resolveAi(userId?: string | null): Promise<ResolvedAi | null> {
  const preference = userId ? await getAiPreference(userId) : null;
  const keys = {} as AvailableKeys;
  for (const provider of AI_PROVIDER_IDS) {
    const own = userId ? await getUserCredentials(userId, provider) : null;
    keys[provider] = {
      own: own?.apiKey || undefined,
      installation: AI_PROVIDERS[provider].environmentKey() || undefined,
    };
  }
  return chooseAi(preference, keys);
}

export async function aiAvailableFor(userId?: string | null): Promise<boolean> {
  return (await resolveAi(userId)) !== null;
}
