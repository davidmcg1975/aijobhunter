# Product specification

## What this is

A web application for UK IT contractors, starting with software testing / QA.
It supports one workflow end to end:

```
upload CV → build profile → set preferences → search jobs
    → AI match with explanation → review → tailor CV
    → generate letter → apply on the original site → track → interview
```

## Who it is for

UK IT contractors. Not permanent employees, and this shapes everything:

- **Day rates, not salaries.** Every rate in the interface is per day.
- **IR35 is a headline fact.** Outside IR35 is a selling point; inside changes
  take-home pay materially. An advert that does not state it is a real gap, and
  the application says "not stated" rather than guessing.
- **Contract length matters.** A 3-month contract and a 12-month contract are
  different propositions.
- **Applications are volume work.** A contractor applies to many roles quickly,
  so the cost of one application must be low.

## Principles

**Honesty over optimism.** The application will not claim experience the user
does not have, and says so plainly when a role is a poor fit. A CV that gets an
interview the user then fails is worse than no interview.

**Transparency over confidence.** A match score is always shown with its
working. A percentage with no explanation cannot be checked, and AI can be
wrong.

**"Not evidenced" is not "cannot do".** A CV omission is a gap in the CV, not a
gap in the person. The wording throughout reflects this, and it is enforced in
code via the three evidence levels.

**The user decides.** The AI proposes; nothing is sent, and nothing is written
to the profile, without confirmation.

## Built (MVP)

### Accounts
Registration, login, logout, email verification, password reset, password
change. Opaque server-side sessions. Rate limiting on every credential
endpoint. Strict per-user data isolation.

### Professional profile
Structured profile as the source of truth: headline, location, contract
preferences (minimum and target day rate, commute, remote/hybrid/on-site, IR35
stance, engagement model, contract length), professional detail (job titles,
years, industries, technologies, testing methodologies, **AI/LLM testing
skills**, certifications, qualifications, soft skills, management experience),
and full employment history.

### CV
Upload PDF or DOCX with magic-byte validation. Text extraction. AI structuring
into a proposed profile, shown for confirmation before anything is written.
Multiple CV versions with one protected master. Export any version to PDF, DOCX
or plain text.

### Jobs
`JobSource` abstraction with an Adzuna adapter. Normalisation into a common
format, including the day-rate conversion Adzuna's annualised figures require.
Deterministic extraction of IR35, rate, remote status and contract length.
Two-stage deduplication. Local job database so filtering costs no API calls.
Search, filter and sort. Job detail with the original advert.

### AI
Job analysis into requirements, responsibilities, technologies, seniority and
industry — including AI/LLM testing content. CV tailoring with a change list, an
honest list of unmet requirements, and a line-level diff against the original.
Covering letters in four tones. Recruiter messages for email, LinkedIn, WhatsApp
and generic portals. Every output checked by the grounding verifier.

### Matching
Deterministic weighted scoring across eight dimensions (technical skills 30,
relevant experience 20, responsibilities 15, industry 10, seniority 10, contract
preferences 5, location 5, rate 5). Full transparency: every dimension shows its
weight, score, contribution and the evidence behind it, at three evidence
levels. Unassessable dimensions are excluded and their weight redistributed.

### Applications
Kanban tracker across the pipeline (Saved → Considering → Applied → Recruiter
contacted → Interview → Offer → Accepted) plus closed states. Per-application
recruiter details, agency, agreed rate, IR35, CV version used, notes and
follow-up date. Applying sets a seven-day follow-up automatically, surfaced on
the dashboard.

### Administration
Service health, user counts, AI spend, job source status and recent source
activity. Disable and delete accounts. **No access to any user's CV, profile,
applications or documents** — counts only.

### GDPR
Privacy policy and terms templates, one-click data export, one-click account
deletion including stored files, explicit AI processing consent at registration,
and an explanation of AI processing in Settings.

## Not built

From the original specification, deliberately deferred:

- Conversational AI assistant (section 23)
- Interview preparation and mock interviews (section 22)
- Skills gap analysis (section 25)
- Application analytics (section 24)
- Saved searches UI and job alerts (sections 27–28) — the data model and the
  cron endpoint exist; there is no interface to create one
- Email notifications beyond verification and reset
- Additional job sources (section 36 phase 8)

The data model supports all of these. The reason for deferring them is section
37 of the original specification: prove the basic workflow is useful first.

## Design decisions worth knowing

**Match scoring is not done by AI.** It is deterministic arithmetic, so it is
reproducible, explainable and testable. The AI structures the inputs; the
arithmetic is ours.

**Job analysis is shared, matching is per-user.** An advert contains no personal
data, so it is analysed once for everyone.

**Search writes to the database.** Results are stored so filtering is instant
and does not consume the provider's API allowance.

**Uncertainty is preserved, not resolved.** `UNKNOWN` IR35 stays unknown. An
advert that mentions both inside and outside is ambiguous, and a guess would
cost the user money.
