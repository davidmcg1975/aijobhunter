import "server-only";
import { z } from "zod";
import { callAi, parseJsonResponse } from "./client";
import { JOB_DETAILS_SYSTEM, jobDetailsPrompt } from "./prompts";
import type { AiJobDetails } from "@/lib/jobsources/manual";

/**
 * Reads the headline facts out of an advert a user pasted, so the form they
 * confirm is already filled in. Model output is untrusted: it is validated
 * here, and everything is optional because a missing field is normal.
 */
const detailsSchema = z.object({
  title: z.string().nullish(),
  company: z.string().nullish(),
  location: z.string().nullish(),
  dayRateMin: z.number().nullish(),
  dayRateMax: z.number().nullish(),
  ir35: z.string().nullish(),
  remote: z.string().nullish(),
});

export async function readJobDetails(params: {
  advert: string;
  userId: string;
}): Promise<AiJobDetails> {
  const response = await callAi({
    operation: "job.analyse",
    userId: params.userId,
    tier: "analysis",
    system: JOB_DETAILS_SYSTEM,
    prompt: jobDetailsPrompt(params.advert),
    maxTokens: 1024,
    // Pulling stated facts out of a page of text: no reasoning required.
    effort: "low",
  });

  return detailsSchema.parse(parseJsonResponse(response.text));
}
