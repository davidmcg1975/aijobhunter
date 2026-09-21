import { z } from "zod";

/**
 * Server-side environment. This module must never be imported from a client
 * component - none of these values may reach the browser.
 *
 * Adzuna and Anthropic credentials in particular are server-only by contract
 * (see docs/security.md).
 */
const serverSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /**
   * Unpooled endpoint, used only for migrations. A connection pooler in
   * transaction mode cannot hold the session state DDL needs.
   */
  DATABASE_URL_DIRECT: z.string().optional(),

  // Session signing/rotation secret. 32+ bytes of randomness.
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),

  APP_URL: z.string().url().default("http://localhost:3000"),

  /**
   * Comma-separated list of email addresses allowed to create an account.
   * Empty means anyone can register, which is only appropriate before the
   * application is reachable from the internet.
   */
  ALLOWED_SIGNUP_EMAILS: z.string().default(""),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // --- Job sources -----------------------------------------------------
  ADZUNA_APP_ID: z.string().optional(),
  ADZUNA_APP_KEY: z.string().optional(),
  ADZUNA_COUNTRY: z.string().default("gb"),
  /**
   * Adzuna's default allowance is 25 hits/min, 250/day, 1000/week, 2500/month
   * and their terms distinguish personal research from commercial use.
   * See docs/adzuna.md. These are enforced in src/lib/jobsources/adzuna.ts.
   */
  ADZUNA_DAILY_CALL_LIMIT: z.coerce.number().int().positive().default(200),
  ADZUNA_LICENCE_MODE: z.enum(["personal", "licensed"]).default("personal"),

  // Reed publishes a documented jobseeker API with a free key:
  // https://www.reed.co.uk/developers
  REED_API_KEY: z.string().optional(),

  // Careerjet affiliate API: https://www.careerjet.com/partners/api/
  CAREERJET_API_KEY: z.string().optional(),
  CAREERJET_LOCALE: z.string().default("en_GB"),

  // --- AI --------------------------------------------------------------
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL_ANALYSIS: z.string().default("claude-sonnet-5"),
  AI_MODEL_WRITING: z.string().default("claude-opus-5"),
  // ChatGPT, for users who choose OpenAI. Terra is OpenAI's balance of
  // capability and cost (the Sonnet equivalent); Sol its flagship (Opus).
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL_ANALYSIS: z.string().default("gpt-5.6-terra"),
  OPENAI_MODEL_WRITING: z.string().default("gpt-5.6-sol"),
  AI_MONTHLY_BUDGET_PENCE: z.coerce.number().int().nonnegative().default(500_00),

  // --- Storage ---------------------------------------------------------
  STORAGE_DRIVER: z.enum(["local", "vercel-blob"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),

  // --- Email -----------------------------------------------------------
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().default("AI Contract Hunter <noreply@localhost>"),

  // Protects the /api/cron/* endpoints.
  CRON_SECRET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** True when the given integration has been configured. */
export const features = {
  adzuna: () => Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
  reed: () => Boolean(process.env.REED_API_KEY),
  careerjet: () => Boolean(process.env.CAREERJET_API_KEY),
  email: () => Boolean(process.env.SMTP_URL),
};
