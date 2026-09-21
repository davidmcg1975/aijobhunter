import Anthropic from "@anthropic-ai/sdk";
import { AiProviderAuthError, AiProviderError, type ProviderCall, type ProviderResult } from "./provider";

/** Claude via the Anthropic SDK. Only callAi() in ./client.ts calls this. */
export async function callAnthropic(call: ProviderCall): Promise<ProviderResult> {
  let response: Anthropic.Message;
  try {
    response = await new Anthropic({ apiKey: call.apiKey }).messages.create({
      model: call.model,
      max_tokens: call.maxTokens,
      system: call.system,
      messages: [{ role: "user", content: call.prompt }],
      // Effort replaces temperature on current models. Cast because the
      // installed SDK's types may predate output_config.
      ...({ output_config: { effort: call.effort } } as object),
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      if (error.status === 401 || error.status === 403) {
        throw new AiProviderAuthError(`API_${error.status}`);
      }
      throw new AiProviderError(`API_${error.status ?? "ERR"}`);
    }
    throw error;
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
