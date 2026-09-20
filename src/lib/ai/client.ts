import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * The only place the Anthropic API is called. Everything goes through here so
 * that usage, cost and failures are recorded, and so the key exists in exactly
 * one module - it must never be imported into a client component.
 */

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new AiUnavailableError(
      "AI features are not configured - ANTHROPIC_API_KEY is missing",
    );
  }
  client = new Anthropic({ apiKey: key });
  return client;
}

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

/**
 * List price in US dollars per million tokens.
 * Source: Anthropic published pricing. Update alongside any model change.
 */
const PRICING_USD: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

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
  const price = PRICING_USD[model] ?? PRICING_USD["claude-sonnet-5"]!;
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

/**
 * How hard the model should work. Maps to output_config.effort.
 *
 * Note there is deliberately no temperature option: sampling parameters
 * (temperature / top_p / top_k) are rejected with a 400 on Claude Opus 5 and
 * Sonnet 5. Effort is the supported control.
 */
export type AiEffort = "low" | "medium" | "high" | "xhigh" | "max";

export type AiCallOptions = {
  operation: AiOperation;
  userId?: string | null;
  system: string;
  prompt: string;
  model?: string;
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
  const model = options.model ?? config.AI_MODEL_ANALYSIS;

  await assertWithinBudget(config.AI_MONTHLY_BUDGET_PENCE);

  const started = Date.now();
  try {
    const response = await getClient().messages.create({
      model,
      max_tokens: options.maxTokens ?? 4096,
      system: options.system,
      messages: [{ role: "user", content: options.prompt }],
      // Effort replaces temperature on current models. Cast because the
      // installed SDK's types may predate output_config.
      ...({ output_config: { effort: options.effort ?? "medium" } } as object),
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    await recordUsage({
      operation: options.operation,
      userId: options.userId,
      model,
      inputTokens,
      outputTokens,
      succeeded: true,
    });

    if (!text) {
      throw new AiResponseError("The AI returned an empty response");
    }

    return { text, model, inputTokens, outputTokens };
  } catch (error) {
    await recordUsage({
      operation: options.operation,
      userId: options.userId,
      model,
      inputTokens: 0,
      outputTokens: 0,
      succeeded: false,
      errorCode: errorCodeOf(error),
    });

    if (error instanceof AiResponseError || error instanceof AiUnavailableError) {
      throw error;
    }

    console.error("[ai] call failed", {
      operation: options.operation,
      model,
      ms: Date.now() - started,
      code: errorCodeOf(error),
    });

    throw new AiResponseError(
      "The AI service could not complete this request. Please try again.",
    );
  }
}

function errorCodeOf(error: unknown): string {
  if (error instanceof Anthropic.APIError) return `API_${error.status ?? "ERR"}`;
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
    where: { createdAt: { gte: monthStart } },
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
