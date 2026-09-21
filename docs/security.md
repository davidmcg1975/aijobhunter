# Security

This application stores CVs, employment history and contact details. That is
sensitive personal data, and the threat model is not hypothetical: a leak means
someone's full employment history and current job search become public.

## Authentication

**Passwords** are hashed with bcrypt at cost 12 (`src/lib/auth/password.ts`).
The minimum length is 12 characters, with no character-class rules — length
does more for real-world security than forcing `Passw0rd!`.

**Sessions** are opaque random tokens, not JWTs
(`src/lib/auth/session.ts`):

- 256 bits from `randomBytes(32)`, base64url encoded
- Only the SHA-256 hash is stored, so a database dump cannot be replayed
- `httpOnly`, `sameSite=lax`, `secure` in production
- 14-day expiry, extended at most once a day to avoid a write per request
- Revocable server-side, which a JWT is not

### Why not next-auth

The specification recommends a mature authentication library. `next-auth` v5 is
still in beta and conflicts on Next.js 16; v4 predates the App Router. Running
beta authentication on a brand-new framework major, for an application holding
CVs, is the larger risk.

What is hand-written here is deliberately the least subtle part: generate a
random token, store its hash, look it up, check expiry. Password hashing —
the part that genuinely should not be hand-rolled — is bcrypt.

If a mature App Router credentials library stabilises, migrating is contained
to `src/lib/auth/`.

**Account enumeration** is defended against in both directions: registering
with an existing address returns the same response as a new one (and emails the
existing account holder), and a failed login spends the same time whether the
account exists or not, via `fakeVerify()`.

**Single-use tokens** for email verification and password reset are stored
hashed, expire (24 hours / 1 hour), and are consumed with a conditional update
so a race cannot use one twice. Issuing a new token invalidates unused earlier
ones.

A password change or reset destroys every other session.

## User data isolation

The single most important property of this application.

| Mechanism | Where |
| --- | --- |
| `userId` on every user-owned table | `prisma/schema.prisma` |
| `findFirst({ where: { id, userId } })` for by-id lookups | all actions |
| Storage keys prefixed `users/<userId>/`, asserted on read | `src/lib/storage.ts` |
| Single authentication gate for all app pages | `src/app/(app)/layout.tsx` |
| Admins see counts, never contents | `src/app/(app)/admin/page.tsx` |

`Job` and `JobAnalysis` are shared reference data and intentionally have no
`userId` — they contain no personal data. `JobMatch` is per-user and does.

**When adding a query for user-owned data, `findUnique({ where: { id } })` is a
bug.** It will happily return another user's row.

## CSRF

Server actions carry Next.js's own origin checks. The one form that posts to a
route handler (logout) is state-changing but not damaging.

`assertCsrf()` implements double-submit token comparison with
`timingSafeEqual` for any future route handler that accepts form posts.

## XSS

React escapes by default. Job advert text arrives from third parties and is
rendered as plain text in a `<pre>`, never with `dangerouslySetInnerHTML` —
which appears nowhere in this codebase, and should not.

`stripHtml()` removes markup, including `<script>` and `<style>` bodies, at
ingest.

A restrictive Content-Security-Policy is set in `next.config.ts`. It still
requires `'unsafe-inline'` for styles and scripts, which is a genuine weakness
inherited from inline styles and Next's inline bootstrap; tightening it with
nonces is worthwhile future work.

## SQL injection

Prisma parameterises everything. There is no raw SQL in this codebase. If
`$queryRaw` is ever needed, use the tagged-template form, never string
concatenation.

## Rate limiting

Database-backed (`src/lib/security/rate-limit.ts`), because an in-memory
counter resets on every serverless cold start and provides no protection at
all in that environment.

| Bucket | Limit |
| --- | --- |
| login | 10 per 15 min, per email **and** per IP |
| register | 5 per hour per IP |
| password reset | 5 per hour |
| CV upload | 20 per hour |
| AI operation | 60 per hour |
| job search | 30 per minute |

Login is limited per address and per source so that hammering one IP cannot
lock out every account, and vice versa.

## File upload

CV uploads are hostile input by default (`src/lib/cv/extract.ts`):

- 10 MB cap, enforced before parsing
- **Magic bytes checked**, not the declared MIME type or extension: `%PDF-` for
  PDF, `PK\x03\x04` for DOCX
- Extension must agree with the detected type
- Parsed with `unpdf` and `mammoth`, both pure JavaScript — no shelling out to
  a native converter
- Parser errors never surface internals to the user
- Files are stored under the user's own prefix, never served from a path the
  user controls

There is no antivirus scanning. Files are never executed and never served back
as HTML, so the residual risk is a malicious document attacking the parser
itself. If this becomes a public service, add a scanning step at upload.

## AI-specific risks

**Prompt injection.** A job advert is untrusted text that goes into a prompt. A
crafted advert could try to instruct the model. Mitigations: adverts are
delimited and labelled as data; model output is validated with Zod before use;
and — most importantly — **the model cannot take actions**. It returns JSON that
is parsed and stored. The worst outcome is a wrong analysis, not a side effect.

**Fabrication.** Covered in detail in `docs/ai-spec.md`. Prompt rules plus
`verifyGrounding()` plus surfacing violations in the UI.

**Cost.** Every call goes through `callAi()`, which records tokens and estimated
cost and refuses once `AI_MONTHLY_BUDGET_PENCE` is reached.

## Secrets

All configuration is server-side. There are **no `NEXT_PUBLIC_` variables in
this project**, by design — that prefix is what puts a value into client
JavaScript.

`src/lib/env.ts` validates the environment with Zod at first use and fails
loudly on a misconfiguration rather than behaving strangely later.

### Users' own API keys

Settings → API keys lets each user use their own Anthropic, Adzuna, Reed or
Careerjet account instead of the installation's.

- **Encrypted at rest** with AES-256-GCM (`src/lib/security/encryption.ts`).
  The key is derived from `AUTH_SECRET` with HKDF, so there is no second
  secret to configure or lose. The user id and provider are bound in as
  authenticated data: a ciphertext moved to another user's row, or another
  provider's, fails to decrypt rather than working.
- **Write-only from the browser.** Once saved, a key is never sent back. The
  page shows its last four characters, and only for keys long enough that
  four characters reveal nothing useful.
- **Never logged.** The audit log records that a key was saved or removed and
  for which provider - not the value, and not the hint.
- **The AI provider choice is binding.** A user who picks ChatGPT has their
  CV sent to OpenAI only; if they have no OpenAI key, AI features are off
  rather than falling back to Anthropic. Changes of choice are audited
  (`ai.provider_changed`), since they change who processes personal data.
- **Used only for its owner.** Searches and AI calls a user makes use their
  key; background jobs use only the installation's.
- **Rotating `AUTH_SECRET` makes saved keys unreadable.** That is the price of
  not having a separate encryption key. The app then falls back to the
  installation's key and the settings page asks the user to enter theirs
  again; nothing fails.
- **Budgets.** A user's own Anthropic spend is not counted against
  `AI_MONTHLY_BUDGET_PENCE` - it is their bill, capped in their Anthropic
  console. The Adzuna daily call counter is still installation-wide,
  whichever key a call used, so it can stop a user's own key early; it never
  lets one overspend.
- Deleting an account deletes its keys (cascade). The data export does not
  include them.

## Logging

`audit()` (`src/lib/security/audit.ts`) writes an append-only log of
security-relevant actions with a closed set of action names.

It scrubs known sensitive keys (`password`, `token`, `apiKey`, `extractedText`,
`content`, …) and truncates any string over 500 characters, because a long
string in metadata is almost certainly user content.

**Never logged:** passwords, API keys, session or reset tokens, CV contents.

Do not rely on the scrubber. Do not pass those values in the first place.

## HTTP headers

Set in `next.config.ts`: HSTS with preload, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a
restrictive `Permissions-Policy`, and CSP with `frame-ancestors 'none'`.

HTTPS is provided by the hosting platform.

## Backups

Delegated to the database provider. Neon and Supabase both offer
point-in-time recovery; **confirm it is switched on before real data exists.**
There is no application-level backup.

## Known gaps

Honest list, for whoever picks this up:

1. CSP requires `'unsafe-inline'`. Nonces would be better.
2. No antivirus scanning on uploads.
3. No two-factor authentication.
4. Rate limiting is a fixed window, so a burst can straddle a boundary.
5. `ADZUNA_LICENCE_MODE` is declarative and not yet enforced.
6. Audit log retention (12 months, per the privacy policy) is not yet automated.
