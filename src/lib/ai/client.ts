import "server-only";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { AI_PROVIDERS, resolveAi } from "./credentials";
import { callAnthropic } from "./anthropic";
import { callOpenAi } from "./openai";
import {
  AiProviderAuthError,
  AiProviderError,
  type AiEffort,
  type AiProviderId,
  type ProviderCall,
  type ProviderResult,
} from "./provider";

export type { AiEffort } from "./provider";

/**
 * The only place an AI provider is called. Everything goes through here so
 * that usage, cost and failures are recorded the same way for every provider,
 * and so keys are used in exactly one module - it must never be imported into
 * a client component.
 *
 * The provider and key are resolved per call from the user's choice in
 * Settings (see chooseAi() in ./credentials.ts).
 */

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export class AiResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiResponseError";
  }
}

const ADAPTERS: Record<AiProviderId, (call: ProviderCall) => Promise<ProviderResult>> = {
  anthropic: callAnthropic,
  openai: callOpenAi,
};

/**
 * Callers say what kind of work it is, not which model: the model depends on
 * which provider the user chose.
 */
export type AiTier = "analysis" | "writing";

function modelFor(provider: AiProviderId, tier: AiTier): string {
  const config = env();
  if (provider === "openai") {
    return tier === "writing" ? config.OPENAI_MODEL_WRITING : config.OPENAI_MODEL_ANALYSIS;
  }
  return tier === "writing" ? config.AI_MODEL_WRITING : config.AI_MODEL_ANALYSIS;
}

/**
 * List price in US dollars per million tokens.
 * Source: Anthropic and OpenAI published pricing. Update alongside any model
 * change. gpt-5.6-sol is on promotional pricing until at least November 2026.
 */
const PRICING_USD: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "gpt-6-astra": { input: 10, output: 50 },
  "gpt-5.6-sol": { input: 4, output: 20 },
  "gpt-5.6-terra": { input: 2, output: 12 },
  "gpt-5.6-luna": { input: 0.2, output: 1.2 },
};

/**
 * An unlisted model (someone set a different one in .env) is costed at the
 * most expensive listed price, so the budget errs towards stopping early
 * rather than letting spend run past it.
 */
const FALLBACK_PRICE = Object.values(PRICING_USD).reduce((max, p) =>
  p.output > max.output ? p : max,
);

/**
 * Budgets are denominated in pence, so dollar prices are converted at a fixed
 * rate. This is for spend control, not accounting - it does not need to track
 * the live exchange rate, but it must not be wildly wrong either.
 */
const USD_TO_PENCE = 80;

function estimateCostPence(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = PRICING_USD[model] ?? FALLBACK_PRICE;
  const dollars =
    (inputTokens / 1_000_000) * price.input +
    (outputTokens / 1_000_000) * price.output;
  return Math.round(dollars * USD_TO_PENCE);
}

export type AiOperation =
  | "job.analyse"
  | "cv.extract"
  | "cv.tailor"
  | "coverletter.generate"
  | "match.explain"
  | "assistant.chat";

export type AiCallOptions = {
  operation: AiOperation;
  userId?: string | null;
  system: string;
  prompt: string;
  tier?: AiTier;
  maxTokens?: number;
  effort?: AiEffort;
};

export type AiCallResult = {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export async function callAi(options: AiCallOptions): Promise<AiCallResult> {
  const config = env();

  const resolved = await resolveAi(options.userId);
  if (!resolved) {
    throw new AiUnavailableError(
      "AI features are not set up. Choose an AI provider and add its API key under Settings → API keys.",
    );
  }
  const { provider, apiKey, ownKey } = resolved;
  const model = modelFor(provider, options.tier ?? "analysis");

  // The installation's budget protects the installation's bill. A user's own
  // key is billed to them, and capped by them with their provider.
  if (!ownKey) await assertWithinBudget(config.AI_MONTHLY_BUDGET_PENCE);

  const started = Date.now();
  try {
    const { text, inputTokens, outputTokens } = await ADAPTERS[provider]({
      apiKey,
      model,
      system: options.system,
      prompt: options.prompt,
      maxTokens: options.maxTokens ?? 4096,
      effort: options.effort ?? "medium",
    });

    await recordUsage({
      operation: options.operation,
      userId: options.userId,
      model,
      inputTokens,
      outputTokens,
      succeeded: true,
      ownKey,
    });

    if (!text) {
      throw new AiResponseError("The AI returned an empty response");
    }

    return { text, model, inputTokens, outputTokens };
  } catch (error) {
    if (error instanceof AiResponseError) throw error;

    await recordUsage({
      operation: options.operation,
      userId: options.userId,
      model,
      inputTokens: 0,
      outputTokens: 0,
      succeeded: false,
      errorCode: errorCodeOf(error),
      ownKey,
    });

    // Only a user's own key is theirs to fix; a rejected installation key is
    // an operator problem and gets the generic message below.
    if (ownKey && error instanceof AiProviderAuthError) {
      throw new AiUnavailableError(
        `${AI_PROVIDERS[provider].displayName} rejected your API key. Check it under Settings → API keys.`,
      );
    }

    console.error("[ai] call failed", {
      operation: options.operation,
      provider,
      model,
      ms: Date.now() - started,
      code: errorCodeOf(error),
    });

    throw new AiResponseError(
      error instanceof AiProviderError && error.code === "REFUSED"
        ? error.message
        : "The AI service could not complete this request. Please try again.",
    );
  }
}

function errorCodeOf(error: unknown): string {
  if (error instanceof AiProviderError) return error.code;
  if (error instanceof Error) return error.name;
  return "UNKNOWN";
}

async function recordUsage(params: {
  operation: string;
  userId?: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  succeeded: boolean;
  errorCode?: string;
  ownKey: boolean;
}): Promise<void> {
  await prisma.aiUsage
    .create({
      data: {
        operation: params.operation,
        userId: params.userId ?? null,
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        costPence: estimateCostPence(
          params.model,
          params.inputTokens,
          params.outputTokens,
        ),
        succeeded: params.succeeded,
        errorCode: params.errorCode,
        ownKey: params.ownKey,
      },
    })
    .catch(() => {});
}

async function assertWithinBudget(budgetPence: number): Promise<void> {
  if (budgetPence <= 0) return;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const result = await prisma.aiUsage.aggregate({
    where: { createdAt: { gte: monthStart }, ownKey: false },
    _sum: { costPence: true },
  });

  if ((result._sum.costPence ?? 0) >= budgetPence) {
    throw new AiUnavailableError(
      "The monthly AI budget for this installation has been reached. " +
        "An administrator can raise AI_MONTHLY_BUDGET_PENCE.",
    );
  }
}

/**
 * Models are asked for JSON but may wrap it in prose or a code fence.
 * Extracts the first balanced JSON object rather than trusting the whole body.
 */
export function parseJsonResponse<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1]!.trim() : text.trim();

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new AiResponseError("The AI response did not contain JSON");
  }

  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    throw new AiResponseError("The AI response contained malformed JSON");
  }
}
