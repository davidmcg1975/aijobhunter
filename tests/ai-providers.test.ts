import { describe, expect, it } from "vitest";
import { chooseAi, type AvailableKeys } from "@/lib/ai/credentials";
import { buildOpenAiRequest, parseOpenAiResponse } from "@/lib/ai/openai";
import { AiProviderError } from "@/lib/ai/provider";

const none: AvailableKeys = { anthropic: {}, openai: {} };

describe("chooseAi", () => {
  it("honours an explicit choice with the user's own key", () => {
    const keys: AvailableKeys = { anthropic: { own: "a-own" }, openai: { own: "o-own" } };
    expect(chooseAi("openai", keys)).toEqual({ provider: "openai", apiKey: "o-own", ownKey: true });
  });

  it("uses the installation's key for the chosen provider when the user has none", () => {
    const keys: AvailableKeys = { anthropic: { own: "a-own" }, openai: { installation: "o-inst" } };
    expect(chooseAi("openai", keys)).toEqual({
      provider: "openai",
      apiKey: "o-inst",
      ownKey: false,
    });
  });

  // The choice decides which company receives the CV: never switch silently.
  it("never falls back to another provider when the chosen one has no key", () => {
    const keys: AvailableKeys = {
      anthropic: { own: "a-own", installation: "a-inst" },
      openai: {},
    };
    expect(chooseAi("openai", keys)).toBeNull();
  });

  it("with no choice, prefers the user's own key of any provider over the installation's", () => {
    const keys: AvailableKeys = { anthropic: { installation: "a-inst" }, openai: { own: "o-own" } };
    expect(chooseAi(null, keys)).toEqual({ provider: "openai", apiKey: "o-own", ownKey: true });
  });

  it("with no choice and no own keys, uses an installation key", () => {
    const keys: AvailableKeys = { anthropic: {}, openai: { installation: "o-inst" } };
    expect(chooseAi(null, keys)).toEqual({
      provider: "openai",
      apiKey: "o-inst",
      ownKey: false,
    });
  });

  it("with no choice, Claude comes first when both are equally available", () => {
    const keys: AvailableKeys = { anthropic: { own: "a-own" }, openai: { own: "o-own" } };
    expect(chooseAi(null, keys)?.provider).toBe("anthropic");
  });

  it("returns null when there is no key anywhere", () => {
    expect(chooseAi(null, none)).toBeNull();
    expect(chooseAi("anthropic", none)).toBeNull();
  });
});

describe("buildOpenAiRequest", () => {
  const request = buildOpenAiRequest({
    model: "gpt-5.6-terra",
    system: "You are careful.",
    prompt: "Analyse this.",
    maxTokens: 4096,
    effort: "high",
  });

  it("maps the system prompt, input and effort", () => {
    expect(request).toMatchObject({
      model: "gpt-5.6-terra",
      instructions: "You are careful.",
      input: "Analyse this.",
      reasoning: { effort: "high" },
      store: false,
    });
  });

  // Rejected by reasoning models, as on Claude Opus 5 / Sonnet 5.
  it("never sends sampling parameters", () => {
    expect(request).not.toHaveProperty("temperature");
    expect(request).not.toHaveProperty("top_p");
  });

  it("leaves room for reasoning on top of the visible answer", () => {
    expect(request.max_output_tokens).toBeGreaterThan(4096);
  });
});

describe("parseOpenAiResponse", () => {
  it("extracts text from message items, skipping reasoning items", () => {
    const result = parseOpenAiResponse({
      status: "completed",
      output: [
        { type: "reasoning", summary: [] },
        {
          type: "message",
          content: [
            { type: "output_text", text: '{"a":1}' },
            { type: "output_text", text: "more" },
          ],
        },
      ],
      usage: { input_tokens: 120, output_tokens: 45 },
    });
    expect(result).toEqual({ text: '{"a":1}\nmore', inputTokens: 120, outputTokens: 45 });
  });

  it("treats a refusal as an error rather than an empty answer", () => {
    expect(() =>
      parseOpenAiResponse({
        status: "completed",
        output: [{ type: "message", content: [{ type: "refusal", refusal: "No." }] }],
      }),
    ).toThrow(AiProviderError);
  });

  it("reports a run that stopped early with nothing to show", () => {
    try {
      parseOpenAiResponse({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output: [{ type: "reasoning" }],
        usage: { input_tokens: 10, output_tokens: 20000 },
      });
      expect.unreachable();
    } catch (error) {
      expect((error as AiProviderError).code).toBe("INCOMPLETE_max_output_tokens");
    }
  });

  it("copes with a body missing optional fields", () => {
    expect(parseOpenAiResponse({})).toEqual({ text: "", inputTokens: 0, outputTokens: 0 });
    expect(parseOpenAiResponse(null)).toEqual({ text: "", inputTokens: 0, outputTokens: 0 });
  });
});
