/**
 * The contract every AI provider adapter meets, so callAi() can record usage,
 * enforce the budget and map errors the same way whichever one a user chose.
 */

export type AiProviderId = "anthropic" | "openai";

/**
 * How hard the model should work. Both providers accept these levels
 * (Anthropic as output_config.effort, OpenAI as reasoning.effort).
 *
 * There is deliberately no temperature option: sampling parameters are
 * rejected with a 400 by Claude Opus 5 / Sonnet 5 and by OpenAI's reasoning
 * models alike.
 */
export type AiEffort = "low" | "medium" | "high" | "xhigh" | "max";

export type ProviderCall = {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
  effort: AiEffort;
};

export type ProviderResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

/** A provider answered but could not complete the request. */
export class AiProviderError extends Error {
  constructor(
    public readonly code: string,
    message = "The AI service could not complete this request.",
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

/** The key was refused (401/403). Worth telling a user whose own key it is. */
export class AiProviderAuthError extends AiProviderError {
  constructor(code: string) {
    super(code, "The AI provider rejected the API key.");
    this.name = "AiProviderAuthError";
  }
}
