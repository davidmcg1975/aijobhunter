# Architecture

## Shape

A single Next.js 16 application. The original specification proposed a Next.js
frontend with a separate Python/FastAPI backend, Redis and Celery. That was
collapsed into one deployable for the first version, because two codebases and
four containers is a lot of moving parts for an MVP with two users.

```
                        Browser
                           │  HTTPS
                           ▼
              ┌────────────────────────┐
              │   Next.js application  │
              │                        │
              │  server components     │
              │  server actions        │
              │  route handlers        │
              └───┬──────────┬─────────┘
                  │          │
      ┌───────────┘          └────────────┐
      ▼                                   ▼
  PostgreSQL                     ┌────────────────┐
  (Prisma 7)                     │  External APIs │
                                 │  Anthropic     │
   Object storage                │  Adzuna        │
   (local / Vercel Blob)         └────────────────┘
```

Every external call happens server-side. The browser never holds a credential
for anything.

### Why this is still splittable later

The boundaries that would become service boundaries already exist as modules
with no framework coupling:

- `src/lib/matching/` — pure functions, no I/O, no Next.js imports
- `src/lib/jobsources/` — a provider interface with one adapter
- `src/lib/ai/` — every model call behind one function

If job fetching and analysis need to become a Python worker later, the contract
to reimplement is `JobSource` and the `Job`/`JobAnalysis` tables, not the whole
application.

## Request flow

```
Server component ──► requireUser() ──► Prisma (always filtered by userId)
                                          │
Server action ─────► requireUser()        │
                     rate limit           ▼
                     validate (Zod)    rendered page
                     mutate
                     audit()
                     revalidatePath()
```

Server actions are the write path. Route handlers exist only where a browser
needs a non-HTML response: CV export (`/api/cv/[id]/export`), logout, and cron.

## The job pipeline

```
  provider search
        │
        ▼
  normalise           adapter converts to NormalisedJob
        │
        ▼
  parse              IR35, day rate, remote, length (deterministic)
        │
        ▼
  deduplicate        fingerprint, then description similarity
        │
        ▼
  store              shared Job row, no userId
        │
        ├──► analyse    AI extracts requirements → JobAnalysis (shared)
        │
        └──► match      deterministic scoring → JobMatch (per user)
```

Searching is a write operation: results go into the local database so the Jobs
page filters locally and does not spend the provider allowance on every page
view.

Analysis is shared across all users because it contains no personal data — one
AI call per advert, not one per user per advert. Matching is per-user and
contains no AI call at all.

## Why matching is deterministic

`src/lib/matching/engine.ts` is arithmetic, not a model call. This is a
deliberate constraint:

- The same inputs always produce the same score.
- Every number traces to a rule that can be shown to the user.
- It is unit testable, and it is tested.
- It costs nothing and takes microseconds, so re-scoring hundreds of jobs after
  a profile edit is trivial.

The AI's job is to turn unstructured text into structure (job advert →
`JobAnalysis`, CV → `Profile`). The arithmetic afterwards is ours.

Dimensions that cannot be assessed — an advert that does not state IR35, a user
who has not set a target rate — are marked `indeterminate` and their weight is
redistributed across the remaining dimensions. Scoring them zero would punish
the user for a recruiter's vague advert.

## Staleness

`JobMatch.profileVersion` records a hash of the profile and CV state a score
was computed against. When the profile changes the version changes, and
`computeMatch()` recomputes rather than returning a stale score. The user can
also force a full re-score from Settings.

## Background work

Vercel Cron calls `/api/cron/fetch-jobs` with `CRON_SECRET` as a bearer token,
compared with a timing-safe comparison. It runs distinct saved searches (so ten
users watching the same search cost one provider call), analyses a capped batch
of new adverts, re-scores users and purges expired rate-limit rows.

`scripts/fetch-jobs.ts` does the same thing from a command line for any other
scheduler.

There is no Redis and no queue. At this scale a cron endpoint doing bounded
work is sufficient; add a queue when a single invocation stops fitting in the
execution limit.

## Storage

`src/lib/storage.ts` abstracts two drivers: local filesystem for development,
Vercel Blob for deployment. Keys are always `users/<userId>/<uuid>-<filename>`
and every read asserts the key belongs to the calling user.

On Vercel the filesystem is ephemeral, so `STORAGE_DRIVER=vercel-blob` is
required there.

## What is deliberately not built

Phase 7 and 8 of the specification — the conversational assistant, interview
preparation, skills-gap analysis, application analytics and additional job
sources — are not built. The data model supports them (`SavedSearch`,
`Notification`, `Interview`, `AiUsage` all exist) but no UI does.

The MVP is the workflow in specification section 38: upload CV, build profile,
search, match, tailor, apply, track.
