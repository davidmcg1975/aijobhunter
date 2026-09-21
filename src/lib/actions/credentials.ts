"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/security/audit";
import { checkRateLimit, RateLimitedError } from "@/lib/security/rate-limit";
import { credentialHint, validateCredentialValues } from "@/lib/credentials/fields";
import { getCredentialProvider } from "@/lib/credentials/providers";
import { deleteUserCredentials, saveUserCredentials } from "@/lib/credentials/store";

export type CredentialState = { error?: string; success?: string };

/**
 * Saves a user's own key. The value is encrypted before it is stored and is
 * never sent back to the browser - the response carries only a message.
 */
export async function saveCredentialsAction(
  _previous: CredentialState,
  formData: FormData,
): Promise<CredentialState> {
  const user = await requireUser();

  try {
    await checkRateLimit("credentials", user.id);
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return { error: "Too many changes in a short time. Try again later." };
    }
    throw error;
  }

  const provider = getCredentialProvider(String(formData.get("provider") ?? ""));
  if (!provider) return { error: "Unknown service." };

  const input: Record<string, unknown> = {};
  for (const field of provider.fields) input[field.name] = formData.get(field.name);

  const result = validateCredentialValues(provider.fields, input);
  if (!result.ok) return { error: result.error };

  await saveUserCredentials(
    user.id,
    provider.id,
    result.values,
    credentialHint(provider.fields, result.values),
  );
  // The provider name only. Never the value, not even the hint.
  await audit({
    action: "credentials.saved",
    userId: user.id,
    metadata: { provider: provider.id },
  });

  revalidatePath("/settings");
  revalidatePath("/jobs");
  return { success: `${provider.displayName} key saved.` };
}

export async function removeCredentialsAction(providerId: string): Promise<CredentialState> {
  const user = await requireUser();
  const provider = getCredentialProvider(providerId);
  if (!provider) return { error: "Unknown service." };

  await deleteUserCredentials(user.id, provider.id);
  await audit({
    action: "credentials.removed",
    userId: user.id,
    metadata: { provider: provider.id },
  });

  revalidatePath("/settings");
  revalidatePath("/jobs");
  return { success: `${provider.displayName} key removed.` };
}
