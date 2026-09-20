# Database

PostgreSQL 14+, accessed through Prisma 7 with the `@prisma/adapter-pg` driver
adapter. Prisma 7 no longer takes a connection URL in the schema; it lives in
`prisma.config.ts` for migrations and in `src/lib/db.ts` for the client.

Full schema: `prisma/schema.prisma`.

## The ownership rule

Every table falls into exactly one of three categories, and knowing which is
how you know whether a query needs a `userId` filter.

**User-owned — always has `userId`, always filtered by it**

`Profile`, `Experience`, `Cv`, `JobMatch`, `SavedJob`, `Application`,
`ApplicationEvent`, `Interview`, `CoverLetter`, `SavedSearch`, `Notification`,
`Session`, `AuthToken`

**Shared reference data — deliberately no `userId`**

`Job`, `JobAnalysis`

A job advert is public information. Analysing it produces no personal data, so
one analysis serves every user. This is why `analyseJob()` costs one AI call
per advert rather than one per user per advert.

**Operational — no user ownership, or nullable**

`AuditLog`, `AiUsage`, `SourceFetchLog`, `RateLimit`, `SystemSetting`

## Entity map

```
User ─┬─ Profile (1:1)
      ├─ Experience (1:n)
      ├─ Cv (1:n) ──┬─ sourceCv (self, tailored ← master)
      │             └─ job (the vacancy it was tailored for)
      ├─ JobMatch (1:n) ─── Job
      ├─ SavedJob (1:n) ─── Job
      ├─ Application (1:n) ─┬─ Job
      │                     ├─ Cv (which version was sent)
      │                     ├─ ApplicationEvent (1:n)
      │                     └─ Interview (1:n)
      ├─ CoverLetter (1:n) ─ Job
      ├─ SavedSearch (1:n)
      ├─ Session (1:n)
      └─ AuthToken (1:n)

Job ──┬─ JobAnalysis (1:1)
      └─ canonical (self, duplicates → the one we display)
```

## Deletion

Every user-owned relation is `onDelete: Cascade`, so deleting a `User` removes
their entire footprint in one statement. This is what makes the GDPR erasure
request in Settings a single call.

Two exceptions are `SetNull`:

- `Cv.sourceCvId` and `Cv.jobId` — deleting a master CV should not delete the
  tailored versions derived from it
- `AuditLog.userId` and `AiUsage.userId` — operational history survives account
  deletion, but is anonymised

Stored CV **files** are outside the database, so `deleteAccountAction()` and
`deleteUserAction()` delete them explicitly before deleting the user.

## Notable columns

**`Job.fingerprint`** — SHA-256 of normalised title + company + location, used
as the cheap candidate key for deduplication. Company is included deliberately:
two "Test Analyst / London" roles at different clients are different jobs.

**`Job.canonicalId`** — when an advert duplicates another, this points at the
row that is displayed. The duplicate row is kept so its original source URL is
never lost. Queries for display filter on `canonicalId: null`.

**`JobMatch.breakdown`** — the full `MatchBreakdown` as JSON: per-dimension
scores, weights and the evidence behind each. This is what the "Why this score?"
view renders. Shape defined in `src/lib/matching/types.ts`.

**`JobMatch.profileVersion`** — a hash of the profile and CV state the score was
computed against. When it no longer matches, the score is stale and gets
recomputed.

**`Profile.provenance`** — records whether each group of profile facts was typed
by the user or extracted from a CV (`cv:<cvId>`).

**`Experience.source`** — `"user"` or `"cv:<cvId>"`. Re-importing a CV replaces
only rows tagged with that CV, so hand-typed history is never destroyed.

**`Cv.isMaster`** — exactly one master per user, enforced in the actions that set
it. Tailoring always creates a new row and never touches the master.

**`AuthToken.tokenHash` / `Session.tokenHash`** — only hashes are stored. The raw
token exists in the email link or the cookie and nowhere else.

## Money

Day rates are stored as **whole pounds in `Int`**. No floats, no minor units.
`AiUsage.costPence` is in pence because AI costs are fractions of a pound.

Adzuna's annualised figures are converted to day rates at ingest (220 working
days). See `docs/adzuna.md`.

## Migrations

Development uses `npm run db:push` for speed. Once deployed, use
`npm run db:migrate` so changes are versioned and reviewable.

Keep migrations reversible where practical. Adding a nullable column or a new
table is safe; dropping a column that still has readers is not — deploy the
code that stops reading it first.

## Indexes

Present on: every foreign key used for filtering, `Job.fingerprint` (dedup
lookup), `Job.postedAt` (default ordering), `JobMatch(userId, score)` (top
matches), `Application(userId, nextFollowUpAt)` (dashboard reminders) and
`RateLimit.expiresAt` (purging).

Unique constraints worth knowing: `Job(source, sourceJobId)` makes re-fetching
idempotent; `JobMatch(userId, jobId)`, `SavedJob(userId, jobId)` and
`Application(userId, jobId)` make the upsert paths safe under concurrency.
