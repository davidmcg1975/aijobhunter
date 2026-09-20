# AI CONTRACT HUNTER

Multi-user web application helping UK IT contractors (initially software
testing / QA) find contracts, understand the requirements, compare them against
real experience, tailor applications honestly, and track the outcome.

## Core principles

1. Never invent functionality that is not specified. Ask instead.
2. Read the relevant file in `/docs` before changing the area it covers.
3. Never expose secrets to the frontend. There are no `NEXT_PUBLIC_` variables
   in this project and there must not be.
4. Never invent user CV information. See "AI rules" below.
5. Every new feature needs tests. Pure logic must be unit tested.
6. Never delete or weaken an existing test to make the suite pass.
7. Maintain strict user data isolation. See "Data isolation" below.
8. Run `npm test` and `npm run typecheck` after every significant change.
9. Keep migrations reversible where practical.
10. Do not add a dependency without a clear reason. Prefer the standard library.

## Commands

> **The embedded database allows exactly one PGlite instance, full stop.**
> Two instances on the same directory corrupt it, and the corruption surfaces
> later as a bare `Aborted()` from WASM with the database unreadable. This has
> already destroyed a database once. Three rules, all load-bearing:
>
> 1. **One process.** Stop `npm run dev` before running `db:seed`,
>    `db:local`, `jobs:fetch` or `cv:restore`. The scripts refuse if the
>    server holds the lock.
> 2. **One instance per process.** `src/lib/db.ts` opens PGlite *at import
>    time*, so a script that imports it must not also construct its own
>    `new PGlite(...)`. `scripts/db-local.ts` duplicates two small helpers
>    rather than importing that module, on purpose - do not "tidy" that away.
> 3. **Close cleanly.** Never call `process.exit()` while writes may be
>    pending. Always `await prisma.$disconnect()` (or `await db.close()`)
>    first - PGlite flushes to disk on close, and exiting early truncates it.
>
> None of this applies to a hosted PostgreSQL server.

```bash
npm run dev          # development server on :3000
npm run build        # prisma generate + next build
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run db:local     # create the schema in the embedded database
npm run db:push      # apply the schema to a real PostgreSQL server
npm run db:migrate   # create a migration (preferred once deployed)
npm run db:seed      # demo user + example jobs
npm run jobs:fetch   # fetch and analyse jobs from the command line
```

Always run `npm run typecheck && npm test` before considering work finished.

## Architecture

Single Next.js 16 application (App Router, TypeScript), PostgreSQL via Prisma 7,
deployable to Vercel. There is no separate backend service: server components,
server actions and route handlers are the backend.

```
src/app/(auth)      unauthenticated pages
src/app/(app)       everything behind the session guard
src/app/(legal)     privacy / terms
src/app/api         route handlers (export, cron, logout)
src/components      React components
src/lib/ai          AI calls, prompts, grounding verification
src/lib/auth        password hashing, sessions, tokens
src/lib/jobsources  JobSource interface + provider adapters
src/lib/matching    deterministic scoring engine + skills taxonomy
src/lib/security    rate limiting, audit logging
src/lib/actions     server actions grouped by feature
```

`src/app/(app)/layout.tsx` is the single authentication gate. A page placed in
that group cannot accidentally be public.

## Data isolation

Absolutely critical. User A must never reach user B's CV, profile,
applications, analyses or documents.

- Every user-owned table has a `userId` column.
- Every query for user-owned data filters on `userId`, including by-id lookups:
  use `findFirst({ where: { id, userId } })`, never `findUnique({ where: { id } })`.
- Object storage keys are prefixed `users/<userId>/` and `src/lib/storage.ts`
  refuses to read a key outside the caller's own prefix.
- `Job` and `JobAnalysis` are shared reference data and deliberately have no
  `userId`. `JobMatch` is per-user and does.
- Admins get counts and operational health only. There is no route that returns
  another user's CV text, profile or applications, and there must not be.

## AI rules

AI-generated content about a user must be grounded exclusively in their
verified profile and their own source CV.

The AI must never fabricate: employment, employers, job titles, dates,
qualifications, certifications, skills, technologies, achievements or metrics.

This is enforced in three places, and all three must stay:

1. `GROUNDING_RULES` in `src/lib/ai/prompts.ts`, included in every writing prompt.
2. `verifyGrounding()` in `src/lib/ai/grounding.ts`, which checks generated text
   against the user's material and returns violations.
3. The UI, which shows violations to the user before they send anything.

Prompt rules alone are not sufficient. If you add a new AI writing operation,
you must also run its output through `verifyGrounding()` and surface the result.

Other AI rules:

- All AI calls go through `callAi()` in `src/lib/ai/client.ts` so that usage,
  cost and failures are recorded and the monthly budget is enforced.
- **Never pass `temperature`, `top_p` or `top_k`.** They are rejected with a
  400 ("deprecated for this model") on Codex Opus 5 and Sonnet 5. Control
  depth and cost with `output_config.effort` instead - `callAi()` exposes it
  as the `effort` option. This was found by running the code, not by reading
  the types: the SDK accepts the parameter and the server refuses it.
- Model IDs carry no date suffix: `Codex-opus-5`, `Codex-sonnet-5`.
- Model output is untrusted input: validate it with Zod before it reaches the
  database.
- Bump `PROMPT_VERSION` when a prompt changes materially. Stored analyses record
  the version they were produced with.
- **Match scores are never produced by an AI model.** `src/lib/matching/engine.ts`
  is deterministic arithmetic so the same inputs always give the same score and
  every number can be explained. Do not "improve" this by asking a model to score.

## Match transparency

A score is never displayed without its explanation. `MatchBreakdown` carries the
per-dimension working, and `MatchExplanation` renders it.

Evidence has three levels and they must stay distinct:

- `CONFIRMED` — demonstrated in the CV or profile
- `INFERRED` — a reasonable inference from related genuine experience
- `NOT_EVIDENCED` — no evidence either way

`NOT_EVIDENCED` must never be presented as "cannot do" or "lacks". The wording
in the UI is deliberate; do not soften it into a deficiency.

Dimensions that genuinely cannot be assessed are marked `indeterminate` and
their weight is redistributed, rather than being scored zero.

## Job source rules

All external job providers implement the `JobSource` interface in
`src/lib/jobsources/types.ts` and are registered in `registry.ts`.

- Never put provider-specific logic anywhere outside `src/lib/jobsources/`.
- Nothing outside that directory may branch on `source === "adzuna"`.
- Adding a provider means adding one adapter and one registry line.
- Provider credentials live in server environment variables only.
- Respect provider rate limits in the adapter itself, not at the call site.
- **Never read `Job.description` directly.** Use `effectiveDescription()`
  from `src/lib/jobsources/description.ts`, which prefers the full advert a
  user has pasted over the provider's 500-character extract. Reading the raw
  column silently works from a fragment and quietly degrades every score and
  document built from it.

See `docs/adzuna.md` for the licensing position, which is a real constraint, not
a formality.

## Conventions

- British English in all user-facing text ("organisation", "personalise").
- UK contracting vocabulary: day rates not salaries, IR35 inside/outside,
  "outside IR35" is a selling point.
- Money is stored as whole pounds in integers. Never use floats for money.
- Dates are `DateTime` in the database and formatted with `formatDate()`.
- Comments explain *why*, not *what*. Do not narrate the code.
- Error messages shown to users are plain English and never leak internals.
- Never log passwords, tokens, API keys or CV contents. `audit()` scrubs known
  sensitive keys and truncates long strings, but do not rely on that — do not
  pass them in the first place.

## Testing

Vitest, in `/tests`. The deterministic core is what matters most:

- `parse.test.ts` — IR35, rate, remote and contract-length extraction
- `matching.test.ts` — scoring, evidence levels, weight redistribution
- `grounding.test.ts` — fabrication detection
- `dedupe.test.ts` — fingerprinting and duplicate detection

Anything involving a real AI call or a real provider call is not unit tested;
test the parsing and validation around it instead.

## Current state

See `progress/progress.md` for what is built, what is stubbed and what is next.
Update it when you finish a phase.
