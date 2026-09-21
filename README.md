# AI Contract Hunter

A job-search tool for UK IT contractors, starting with software testing and QA.

It finds contracts, works out what they actually require, compares that against
your real experience, tailors your application without inventing anything, and
tracks what happens next.

## What makes it different

**Match scores you can check.** Every score comes with its working: which
dimension contributed what, and the evidence behind each requirement. Evidence
is labelled as demonstrated, inferred from related experience, or not evidenced
— and "not evidenced" is never presented as "cannot do".

**A CV tailorer that will not lie for you.** The AI is told not to invent
employers, dates, technologies, qualifications or achievements. Then its output
is checked against your actual CV in code, and anything it introduced is shown
to you before you send it anywhere. If a job needs something you have not done,
you are told, rather than having it quietly added.

**Built for contracting.** Day rates, not annual salaries. IR35 status treated
as a headline fact, and left as "not stated" when an advert is ambiguous rather
than guessed.

## Getting started

### With Docker (easiest)

Nothing to install except Docker; it brings its own database.

```bash
cp .env.example .env     # then set AUTH_SECRET, ALLOWED_SIGNUP_EMAILS and your API keys
docker compose -f docker-compose.local.yml up --build
```

Open <http://localhost:3000> and register. Full walkthrough, including where
to get the keys: [`docs/running-locally.md`](docs/running-locally.md).

### Without Docker

Node.js 20+, and a PostgreSQL database. A free [Neon](https://neon.tech)
database takes about two minutes and is what this runs on.

```bash
npm install
cp .env.example .env     # then set DATABASE_URL and AUTH_SECRET
npm run db:push          # create the schema
npm run db:seed          # demo account + two example jobs
npm run dev
```

There is also an embedded database (`DATABASE_URL="file:./.pglite"` plus
`npm run db:local`) that needs no account at all. It is real PostgreSQL
compiled to WebAssembly and is fine for a quick look, but it corrupted itself
three times during development whenever a process was killed rather than
stopped cleanly — so do not keep anything you care about in it.

Open <http://localhost:3000> and sign in:

```
email:    demo@example.com
password: correct-horse-battery-staple
```

That works with no API keys at all — the seeded jobs exercise matching and the
score explanation immediately.

You will want to set `AUTH_SECRET` in `.env` before anything real:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

**The first account to register becomes the administrator.**

> **On Neon, set two connection strings.** `DATABASE_URL` is the pooled
> endpoint (used by the app); `DATABASE_URL_DIRECT` is the direct one (used by
> migrations), because a pooler cannot hold the locks DDL needs. Remove
> `&channel_binding=require` from the direct URL only — Prisma's migration
> engine cannot negotiate it and reports a misleading "can't reach database
> server". Both are explained in `.env.example`.

## Adding the integrations

**Adzuna** (job search) — register at <https://developer.adzuna.com/>:

```
ADZUNA_APP_ID="..."
ADZUNA_APP_KEY="..."
```

Read [`docs/adzuna.md`](docs/adzuna.md) before letting anyone else use the
service. Adzuna's free allowance is for personal research, and running a
multi-user service on it is a licensing question.

**Anthropic** (analysis, tailoring, letters) — from
<https://console.anthropic.com/>:

```
ANTHROPIC_API_KEY="..."
```

There is a monthly spending cap, `AI_MONTHLY_BUDGET_PENCE`, defaulting to £500.

## Commands

```bash
npm run dev          # development server
npm run build        # production build
npm run typecheck    # TypeScript
npm test             # unit tests
npm run db:local     # create the schema in the embedded database
npm run db:push      # apply the schema to a real PostgreSQL server
npm run db:migrate   # create a migration
npm run db:studio    # browse the database
npm run db:seed      # demo data
npm run jobs:fetch   # fetch and analyse jobs from the command line
```

## Deploying

See [`docs/deployment.md`](docs/deployment.md) for hosting requirements and the
full go-live checklist.

Two things decide the hosting before anything else:

- **Careerjet authorises by source IP**, so it needs a static outbound address.
  Serverless platforms do not provide one on standard plans; a small VPS does.
- **Set `ALLOWED_SIGNUP_EMAILS`** before the URL is reachable, or anyone who
  finds it can register and upload a CV.

## Documentation

| File | Contents |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | Working rules for AI-assisted development |
| [`docs/product-spec.md`](docs/product-spec.md) | What is built, what is not, and why |
| [`docs/architecture.md`](docs/architecture.md) | System shape and the job pipeline |
| [`docs/database.md`](docs/database.md) | Schema, ownership rules, deletion |
| [`docs/security.md`](docs/security.md) | Auth, isolation, uploads, known gaps |
| [`docs/ai-spec.md`](docs/ai-spec.md) | Prompts, grounding, and how fabrication is caught |
| [`docs/adzuna.md`](docs/adzuna.md) | Adzuna integration and licensing |
| [`docs/job-sources.md`](docs/job-sources.md) | Adding a job source, and which ones permit it |
| [`docs/running-locally.md`](docs/running-locally.md) | Running it on your own machine with Docker |
| [`docs/deployment.md`](docs/deployment.md) | Hosting requirements and the go-live checklist |
| [`progress/progress.md`](progress/progress.md) | Current state and next steps |

## Status

The MVP workflow runs. Registration, login, sessions, the job list, match
scoring and the score explanation have all been exercised in a browser against
a real database. Adzuna and Careerjet are both verified against their live
APIs. 123 unit tests cover the deterministic core.

AI features are verified end to end against the live API: job analysis, CV
tailoring with the grounding check, and DOCX/PDF extraction round-tripping.

Still unexercised: CV upload through the browser, cover letters, and the
application tracker. See [`progress/progress.md`](progress/progress.md).

## Before other people use it

The full list is in [`docs/deployment.md`](docs/deployment.md). The ones that
matter most:

- Set `ALLOWED_SIGNUP_EMAILS` — registration is open to anyone without it
- Rotate every credential that has been pasted into a chat or a commit
- Resolve the Adzuna licensing question ([`docs/adzuna.md`](docs/adzuna.md))
- Complete the placeholders in the privacy policy and terms of service
- Turn on database backups
- Configure SMTP, or a forgotten password cannot be recovered without an admin
