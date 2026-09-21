-- Which AI provider a user has chosen: "anthropic" or "openai". Null means
-- not yet chosen (see chooseAi() in src/lib/ai/credentials.ts).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiProvider" TEXT;
