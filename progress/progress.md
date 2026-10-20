# Progress

Last updated: 20 September 2026

## Status

**The application runs and the core workflow has been used in a browser.**

Verified live against a real database: sign-in, session handling, the
navigation shell, the jobs list, job detail, match scoring and the full score
explanation with all three evidence levels. Two seeded jobs scored 86% (strong)
and 42% (weak) with correct reasoning on both, which confirms the scoring
actually discriminates rather than flattering everything.

The Adzuna adapter is verified against the live API. Three of its documented
behaviours turned out to be wrong in practice; all three are fixed and written
up in `docs/adzuna.md`:

1. Descriptions are a **500-character extract**, never the full advert, and no
   full-text field exists. This caps analysis quality and is now flagged to the
   AI and to the user rather than hidden.
2. `what` is an **AND**, so a natural multi-word search plus a contract filter
   returns zero results with no error. Added `keywordMode`; the UI defaults to
   OR.
3. Contract salaries are **not consistently annualised** — one advert reported
   `130000` (annual) and another `300` (already a day rate) in the same
   response. The old code turned the second into £1/day.

**AI features are verified end to end**: job analysis, CV tailoring with the
grounding check, and DOCX/PDF extraction round-tripping. Both configured models
were confirmed against the live API before anything was wired up.

Running it exposed seven bugs that no amount of typechecking would have found:

1. **`temperature` is rejected with a 400 on Opus 5 and Sonnet 5** ("deprecated
   for this model"). Every AI call in the codebase passed it, so the entire AI
   feature set would have failed on first use. Replaced with
   `output_config.effort`, tuned per operation.
2. The AI cost table was invented and ~3x too high, so the monthly budget cap
   would have cut off spending far too early. Replaced with published prices.
3. Requirement phrases like "Strong Selenium WebDriver automation experience"
   did not match the skill "Selenium", so a candidate with eight years of it
   scored as unevidenced. `canonicaliseList` now extracts known skills from
   inside a phrase.
4. A Content-Security-Policy that blocked React's development build.
5. PGlite failing when bundled by Next (WASM must stay external).
6. A relative database path that must be absolute inside the Next runtime.
7. `server-only` made every CLI script (`db:seed`, `jobs:fetch`) throw on
   import. Fixed with the `react-server` export condition.

Plus one design flaw found by observation: the "Analyse with AI" button stayed
hidden when a stored analysis was stale, so a prompt change could never be
applied from the UI.

### Pasting the full advert

The 500-character limit above capped everything, so a user can now paste the
real advert in from the original posting. Verified end to end: 616-char extract
to 2,244-char advert took the named requirements from 9 to 20, responsibilities
matched from 67% to 94%, let the industry be detected at all, and moved the
score from 80% to 85%. Details and the design note in `docs/adzuna.md`.

### Users' own API keys (21 September 2026)

Settings → API keys lets each user enter their own Anthropic, Adzuna, Reed
and Careerjet credentials, so someone running their own copy never has to
edit `.env` beyond `AUTH_SECRET` and the allowlist. Encrypted at rest, never
sent back to the browser, used only for their owner, and falling back to the
installation's keys when not set. Job source adapters now receive credentials
rather than reading the environment. Design and trade-offs in
`docs/security.md`. Unit tested (encryption, validation, every provider's
key shape); schema applied to Neon.

### Adding a job found elsewhere (20 October 2026)

Contracts arrive on LinkedIn, agency sites and by email, none of which this
application can search. A pasted advert now becomes a job: the AI reads its
headline fields, the user corrects them, and it is analysed, scored and
tailored like any other. Such jobs are private to whoever added them
(`Job.addedByUserId`), which constrains every query that reaches a job -
verified against the real database, owner sees it, other account does not,
background sweeps skip it.

Verified end to end with a realistic advert: fields read correctly (company
left blank, because the advert never named the bank), saved, and **scored 76%
with all eight dimensions assessed** - a job board extract typically leaves
five of them unassessable. Cost: under a penny.

### "Why is everything 60%?" (19 October 2026)

The first user of a fresh copy saw receptionist, labourer and customer
service adverts all at "60% match". Cause: dimensions that cannot be assessed
have their weight redistributed, so a job assessed only on length of
experience (20% of the weight) still produced a confident number. Across 392
stored matches the split was clean - below half the weight assessed, scores
bunched in a meaningless 48-60 band; at half or more they spread 12-94 and
discriminated properly. Those are also exactly the matches where technical
skills could be assessed.

Such scores now show "Not enough to score" with the reason and the fix
(analyse the advert, or paste its full text), rank below every real score,
and are kept off the dashboard. Scoring arithmetic is untouched. See
`isUnderEvidenced()` in `src/lib/matching/evidence.ts`.

### Tailoring keeps the CV's own formatting (21 September 2026)

A Word CV is now tailored by editing a copy of the user's own document in
place: same fonts, bullets, spacing, header and footer, with some paragraphs
reworded. Dates, titles, employers, headings and layout lines are locked in
code. Verified on a real CV end to end - see `docs/ai-spec.md`. PDF uploads
still get plain-text tailoring. The PDF download of a tailored Word CV is the
plain layout; for the user's own formatting as PDF, save the Word file as PDF.

### ChatGPT as an alternative AI (21 September 2026)

Each user chooses Claude (Anthropic) or ChatGPT (OpenAI) under Settings → AI
provider. OpenAI is called through its Responses API with plain fetch
(`gpt-5.6-terra` for analysis, `gpt-5.6-sol` for writing). Grounding, Zod
validation and scoring are unchanged and provider-agnostic. Verified: the
refactored Claude path with a real call; choosing ChatGPT with no key turns AI
off rather than falling back; an Anthropic key pasted into the OpenAI box is
refused. **Not yet verified: a real OpenAI call** - there is no OpenAI key in
this environment. Request building and response parsing are unit tested
against OpenAI's documented format, but the first real call is the real test.

### Now on hosted PostgreSQL (20 September 2026)

Moved off the embedded database to **Neon, eu-west-2 (London)** - London
deliberately, because CVs and employment history are UK personal data and the
privacy policy commits to UK GDPR. Verified: schema pushed, seeded, CV
restored, sign-in and the CV page working. A CLI script and the dev server ran
against it **simultaneously**, which is exactly what corrupted PGlite three
times; on a real server it is a non-event.

Two Neon-specific traps, both now documented in `.env.example` and
`CLAUDE.md`:

1. **Migrations must use the direct endpoint, not the pooled one.** A pooler in
   transaction mode cannot hold the session state and advisory locks DDL needs.
   Hence `DATABASE_URL` (pooled, for the app) and `DATABASE_URL_DIRECT`
   (direct, for migrations).
2. **`channel_binding=require` breaks Prisma's migration engine** with a
   misleading `P1001 Can't reach database server`. The database is perfectly
   reachable - node-postgres connected on all four URL variants - but Prisma's
   Rust engine cannot negotiate channel binding. Keep it on the pooled URL,
   remove it from the direct one.

The second cost about ten minutes chasing a connectivity problem that did not
exist. Worth testing a raw driver connection before believing P1001.

**Third trap, found in use:** `Server has closed the connection.` on an
ordinary query. Serverless Postgres suspends when idle and its pooler drops
idle connections, but the pg defaults keep handing Prisma sockets the server
has already closed. Fixed in `src/lib/db.ts` by expiring our own connections
first (`idleTimeoutMillis: 10s`), allowing 20s to connect so a suspended
compute has time to wake, and retrying **once** on connection-level errors
only. A genuine query error still fails immediately — the retry is narrow on
purpose.

This is normal operation rather than a fault, and it hits hardest exactly when
someone opens the app after a quiet spell. Verified after the fix: sign-in,
dashboard, jobs list and a live Adzuna search (25 adverts ingested) with no
errors in the server log.

### Durability warning (historical - resolved by the move above)

PGlite has now corrupted itself **twice**, both times after a process was
killed rather than stopped (a command timeout, then a deliberate stop). The
uploaded CV file survived on disk each time and was re-imported with
`npm run cv:restore`, so nothing was permanently lost - but a database that
cannot survive Ctrl-C is not somewhere to keep real data for long.

Contributing bugs, all now fixed: two PGlite instances opened in one process
(`scripts/db-local.ts` imported the module that opens one at import time),
and `process.exit()` called before the flush completed.

**Recommendation: move to a hosted PostgreSQL server** (Neon free tier) before
relying on this for a real job search. It also removes the one-process-at-a-time
restriction and is needed for deployment regardless. `prisma/migrations-local`
exists so schema changes no longer require wiping the embedded database.

### Live Adzuna search, and two bugs it exposed (17 September 2026)

A real search finally ran end to end: 30 adverts fetched, normalised, stored and
scored. It surfaced two trust-destroying bugs that no unit test had caught,
because both only appear against real, messy data.

1. **The keyword default was far too broad.** "Any of these words" turned
   "test analyst QA automation" into a match on *any* of those words, so
   "Analyst" alone pulled in AML Analyst, Finance Manager and HR Assistant.
   The default is now "All of these words"; "any" remains for widening a search
   that returns nothing.
2. **Unassessable skills inflated the score.** "AML Analyst" scored **85%** for
   a software tester - the highest on the page - because the advert named no
   recognisable skills, so technical skills (30%) was redistributed and length
   of service carried the rest. Scores are now capped at 60 when technical
   skills cannot be assessed, with the reason shown. The same search now ranks
   Senior Test Analyst at 86% and holds every irrelevant role at 60.

The second one is the more important lesson: the weight-redistribution rule was
correct for minor dimensions and actively harmful for the dominant one.

### Job sources

- **Careerjet** is **live and verified** (20 September 2026). Two access gates,
  revealed one at a time: the source IP must be allow-listed in the publisher
  account, and then a Referer header is required (any value; the adapter sends
  APP_URL). Running an identical search twice reports "60 adverts: 0 new".

  Building it from documentation alone would have shipped a serious bug. The
  docs imply the advert URL identifies a job; in reality it is a
  jobviewtrack.com redirect whose whole path token is regenerated per request -
  10 of 10 URLs differed between two searches 2.5 seconds apart. Keying on it
  would have re-imported every advert as new on every search. The id is now a
  hash of title + company + location. Dates were also RFC 1123 rather than the
  documented DD/MM/YYYY.
- **Reed** adapter written, but the key **cannot be obtained self-serve**: the
  sign-up link on their developer docs is a dead placeholder. Contact them.
- **JobServe** deliberately not implemented - `robots.txt` disallows it.

Published API documentation is not evidence that access is available.

## Phases

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Foundation: accounts, database, dashboard, profile, settings | **Verified in a browser** |
| 2 | CV: upload, PDF/DOCX extraction, master CV, structured profile | Extraction + export **verified** (DOCX and PDF round-trip); browser upload not yet exercised |
| 3 | Adzuna: adapter, search, job database, dedup, detail page | **Verified end to end** - live search, ingest, dedup and scoring |
| 4 | AI matching: analysis, scoring, explanations | **Verified end to end in a browser**, including live AI analysis |
| 5 | CV customisation: tailoring, comparison, export, letters | Tailoring + grounding **verified end to end**; letters not yet run |
| 6 | Applications: tracker, statuses, notes, follow-ups | Built; not yet exercised |
| 7 | Intelligence: assistant, interview prep, analytics, skills gap | Not started |
| 8 | More job sources | Reed + Careerjet adapters written; both need keys |

## Verified

- `npm run build` — passes, 22 routes
- `npm run typecheck` — clean
- `npm test` — 110 tests passing across 7 files
  - `parse.test.ts` (34) — IR35, rate, remote, contract length, provider salary units, HTML stripping
  - `matching.test.ts` (21) — scoring, evidence levels, weight redistribution,
    determinism, requirement-phrase canonicalisation
  - `grounding.test.ts` (10) — fabrication detection
  - `dedupe.test.ts` (12) — fingerprinting, similarity, duplicate detection
  - `description.test.ts` (14) — full-advert precedence and paste validation

Twelve real bugs were found and fixed during development: two by the unit
tests, three by probing the live Adzuna API, and seven by actually running the
application. See Status above. The lesson worth keeping: a clean typecheck and
a green test suite said nothing about whether a single AI call would succeed.

## Not yet exercised

- Registration of a new account, password reset, email verification
- CV upload **through the browser** (the extraction and export code beneath it
  is verified)
- Adzuna **ingest and deduplication** end to end (the adapter and its parsing
  are verified against the live API; storing and de-duplicating a real result
  set has not been run)
- Cover letters and recruiter messages (the same verified code path as
  tailoring, but not individually run)
- The application tracker
- **The Docker images themselves**, though the first real attempt (19 October
  2026, by the person it was built for) found the first bug: the Dockerfile
  copied `/app/public`, which existed nowhere - not in git, not on the
  development machine - and Docker fails a build when a COPY source is
  missing. Fixed with `public/.gitkeep` and a `mkdir -p` in the builder. The
  local clean-build check had hidden it by discarding copy errors; there is
  now a fresh-clone check (clone, `npm ci`, build, assert every COPY source
  exists) which passes. The rest of the image build is still unproven.
- **The Docker images themselves.** `docker-compose.local.yml` (app + its own
  PostgreSQL, see `docs/running-locally.md`) and `docker-compose.yml` (server,
  with Caddy) have never been built: there was no Docker on the development
  machine. What *is* verified is the part most likely to break inside a
  container — a production build from a clean copy with no `.env`, with the
  placeholder `DATABASE_URL` the Dockerfile uses, and the resulting standalone
  server answering `/login` and `/register` (21 September 2026).

## Next steps

The application already runs:

```bash
npm run dev     # then sign in as demo@example.com
```

1. **Upload your friend's real CV** at /cv. Extraction is verified, but only
   against a CV this project generated - a real one is the honest test, and it
   replaces the fictional demo profile that every score currently rests on.

2. **Run a live job search** from /jobs. Adzuna is configured. This exercises
   ingest, normalisation and deduplication against real adverts for the first
   time.

3. **Adzuna and Anthropic are both configured and verified.** Nothing to do.

4. **Then check the tailoring output sceptically.** Tailor a CV for a job the
   user is a poor fit for, and confirm the grounding warnings and the
   "requirements your CV does not evidence" list behave as intended. This is
   the feature most worth distrusting.

5. **Before anyone else gets an account:** move to a hosted database (the
   embedded one is a local folder), resolve the Adzuna licensing question in
   `docs/adzuna.md`, complete the placeholders in the privacy policy and terms,
   and switch on database backups.

## Known issues

- `ADZUNA_LICENCE_MODE` is declarative and not enforced anywhere. The account in
  use is on **Trial Access**, so this must be resolved before a second user.
- **The embedded database allows one process at a time.** Running a CLI script
  while the dev server is up used to silently destroy the server's writes; the
  scripts now refuse instead. A hosted PostgreSQL server has no such limit.
- Job adverts are only ever a 500-character extract (see `docs/adzuna.md`),
  which caps how good any analysis or match score can be.
- CSP still needs `'unsafe-inline'` for styles and scripts.
- No antivirus scanning on CV uploads.
- Saved searches have a data model and a cron endpoint but no UI, so the
  scheduled fetch has nothing to run until one is created directly.
- Audit log retention is documented as 12 months but not automated.
- `next lint` is not configured (ESLint is not installed); `typecheck` and the
  test suite are the current quality gates.

## Decisions taken

**Single Next.js application** rather than the specified Next.js + FastAPI +
Redis + Celery split. Two codebases and four containers is disproportionate for
an MVP with two users. The module boundaries that would become service
boundaries already exist. See `docs/architecture.md`.

**No `next-auth`.** v5 is still beta and conflicts on Next.js 16; v4 predates
the App Router. Sessions are opaque random tokens stored hashed in Postgres,
which is the least subtle part of authentication to write. Password hashing is
still bcrypt. See `docs/security.md`.

**Deterministic match scoring**, not AI scoring, so scores are reproducible,
explainable and testable. See `docs/architecture.md`.

**Grounding enforced in code**, not just in prompts. See `docs/ai-spec.md`.
