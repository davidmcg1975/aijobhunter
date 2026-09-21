import { AiProviderAuthError, AiProviderError, type ProviderCall, type ProviderResult } from "./provider";

/**
 * OpenAI (ChatGPT) via the Responses API, with plain fetch - one POST does not
 * justify another SDK dependency.
 *
 * Only callAi() in ./client.ts calls this. Like the Anthropic path it never
 * sends temperature/top_p: OpenAI's reasoning models reject them, and effort
 * is the supported control on both providers.
 */

const ENDPOINT = "https://api.openai.com/v1/responses";

/**
 * On OpenAI, max_output_tokens includes the model's hidden reasoning. A limit
 * sized for the visible answer alone can be spent entirely on reasoning and
 * return nothing, so the reasoning gets its own headroom. Only tokens actually
 * produced are billed.
 */
const REASONING_HEADROOM = 16_000;

export function buildOpenAiRequest(call: Omit<ProviderCall, "apiKey">) {
  return {
    model: call.model,
    instructions: call.system,
    input: call.prompt,
    max_output_tokens: call.maxTokens + REASONING_HEADROOM,
    reasoning: { effort: call.effort },
    // Nothing is kept on OpenAI's side for later retrieval; each call stands
    // alone, as it does with Anthropic.
    store: false,
  };
}

type OpenAiContent = { type?: string; text?: unknown; refusal?: unknown };
type OpenAiResponse = {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: Array<{ type?: string; content?: OpenAiContent[] }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

/**
 * Pulls the visible text and token counts out of a Responses API body.
 * Reads the raw `output` array rather than trusting any one convenience
 * field: reasoning items come first and carry no text.
 */
export function parseOpenAiResponse(body: unknown): ProviderResult {
  const response = (body ?? {}) as OpenAiResponse;
  const content = (response.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? []);

  const refusal = content.find((c) => c.type === "refusal");
  const text = content
    .filter((c) => c.type === "output_text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n")
    .trim();

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  if (!text && refusal) {
    throw new AiProviderError("REFUSED", "The AI declined to complete this request.");
  }
  if (!text && response.status === "incomplete") {
    throw new AiProviderError(
      `INCOMPLETE_${response.incomplete_details?.reason ?? "unknown"}`,
      "The AI stopped before finishing. Please try again.",
    );
  }

  return { text, inputTokens, outputTokens };
}

export async function callOpenAi(call: ProviderCall): Promise<ProviderResult> {
  const { apiKey, ...rest } = call;
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildOpenAiRequest(rest)),
    signal: AbortSignal.timeout(180_000),
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) {
    throw new AiProviderAuthError(`API_${response.status}`);
  }
  if (!response.ok) {
    // The body can describe the request; only the status is kept.
    throw new AiProviderError(`API_${response.status}`);
  }

  return parseOpenAiResponse(await response.json());
}
