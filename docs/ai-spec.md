# AI specification

## The one rule

AI-generated content about a user must be grounded exclusively in that user's
verified profile and their own source CV.

The AI must never fabricate employment, employers, job titles, dates,
qualifications, certifications, skills, technologies, achievements or metrics.

This is not a nicety. A tailored CV claiming Playwright experience the user does
not have will fail in a technical interview, and the user will not know why it
was there.

## Why prompts alone are not enough

A prompt saying "do not invent things" reduces fabrication. It does not
eliminate it, and it gives no signal when it fails. So the rule is enforced
three times:

**1. In the prompt.** `GROUNDING_RULES` in `src/lib/ai/prompts.ts` is a single
constant included verbatim in every writing prompt. It explicitly permits
re-ordering, re-wording and re-emphasising, and explicitly requires omission
over invention:

> If the vacancy asks for something the person has not evidenced, do NOT add
> it. Omit it. It is correct and expected for a tailored CV to lack some
> requirements.

**2. In code.** `verifyGrounding()` in `src/lib/ai/grounding.ts` checks the
generated text against the user's material and returns a list of violations.

**3. In the interface.** Violations are shown to the user before they send
anything, with the specific value and what to do about it.

If you add a new AI writing operation, all three apply.

## How the verifier works

`verifyGrounding(generated, source)` checks four things:

| Check | Method | Why it works |
| --- | --- | --- |
| Dates | every 4-digit year in the output must appear in the source | years are unambiguous tokens |
| Technologies | every skill from the closed taxonomy found in the output must be in the source | vocabulary-bounded, so no false positives from ordinary prose |
| Qualifications | degree and certification patterns must be in the source | small, well-defined pattern set |
| Metrics | percentages, multipliers and money must appear in the source | catches the classic invented "reduced testing time by 40%" |

The technology check is the strongest of the four, because it operates over a
closed vocabulary (`SKILL_ALIASES` in `src/lib/matching/skills.ts`). "Playwright
appears in the output but nowhere in the source" is a definite finding, not a
guess.

Employers are treated differently: a missing employer is reported as an
**omission**, not a violation, because condensing an old role is legitimate
tailoring. The user is told, and decides.

The verifier flags. It never silently rewrites — a silent fix would hide the
fact that the model tried to fabricate.

## Operations

All go through `callAi()` in `src/lib/ai/client.ts`, which records tokens, cost
and failures, and enforces `AI_MONTHLY_BUDGET_PENCE`.

| Operation | Model | Purpose | Grounded |
| --- | --- | --- | --- |
| `job.analyse` | analysis | advert → structured requirements | n/a (no user data) |
| `cv.extract` | analysis | CV → structured profile | transcription only |
| `cv.tailor` | writing | tailored CV for one vacancy | yes |
| `coverletter.generate` | writing | covering letter | yes |

Each user chooses Claude (Anthropic) or ChatGPT (OpenAI) in Settings. Callers
ask for a tier, and each provider maps it to a model, configurable in `.env`:

| Tier | Claude | ChatGPT |
| --- | --- | --- |
| analysis (high volume, structured output) | `claude-sonnet-5` | `gpt-5.6-terra` |
| writing (fewer calls, quality matters more) | `claude-opus-5` | `gpt-5.6-sol` |

The pairs are matched on role and price: Terra is OpenAI's balance of
capability and cost ($2/$12 per million tokens against Sonnet's $2/$10), Sol
its flagship ($4/$20, promotional until at least November 2026, against
Opus's $5/$25). Prompts, grounding verification and Zod validation are the
same for both - the provider changes who writes the draft, not how it is
checked.

An explicit choice is never overridden: with no key for the chosen provider,
AI features are off rather than quietly sent to the other one, because the
choice decides which company receives the user's CV.

**Sampling parameters are not used, and must not be.** `temperature`, `top_p`
and `top_k` are rejected with a 400 on Claude Opus 5 and Sonnet 5
("`temperature` is deprecated for this model"), and by OpenAI's reasoning
models. Depth and cost are controlled with effort instead
(`output_config.effort` / `reasoning.effort`; both accept the same levels):

| Operation | Effort | Why |
| --- | --- | --- |
| `job.analyse` | low | Extraction from a 500-character advert extract |
| `cv.extract` | medium | Long transcription, accuracy matters |
| `cv.tailor` | high | The output goes to an employer |
| `coverletter.generate` | high | Same |

The SDK accepts `temperature` without complaint and the server refuses it, so
this is only visible at runtime. It is asserted in `CLAUDE.md` because it will
otherwise be reintroduced by anyone working from an older mental model.

## Job analysis

Shared across all users — a job advert contains no personal data, so it is
analysed once, not once per user. Cached on `JobAnalysis` and re-run only when
`PROMPT_VERSION` changes.

The prompt insists that "unknown" is a correct answer:

> You extract only what the advert actually says. If the advert does not state
> something, return null or an empty list — never guess.

The advert's own structured fields override the model where both exist: if
Adzuna says the contract type is `contract` and the deterministic parser found
"outside IR35" in the text, those win over the model's reading.

Rates outside £50–£3000/day are discarded as model error rather than stored.

## CV extraction

The prompt frames the model as a transcriber, not an author:

> You are a transcriber, not an author. Every value you output must be
> traceable to specific text in the CV. Do not normalise job titles into
> something they are not, do not infer skills from job titles.

**Extraction never writes to the profile.** It is stored on the `Cv` row and
shown to the user, who confirms it. The structured profile is the source of
truth for everything downstream, so it must be something the user has agreed
to, not something a model decided.

On confirmation, values are **merged**, not replaced, so a second CV upload
never deletes something the user typed. Employment history rows created from a
CV are tagged `source: "cv:<cvId>"` and only rows with that tag are replaced —
hand-typed roles survive.

A role whose date cannot be parsed is **kept with a null date**, not skipped and
not given a guessed one. Real CVs routinely list early-career roles without
dates - on the first real CV tested, 10 of 21 roles had none - and dropping
them silently loses half a career. `Experience.startDate` is nullable for this
reason, undated roles sort last, and the import screen says how many were
undated.

## CV tailoring

Input: master CV + structured profile + job advert.
Output: tailored CV text, a list of changes with reasons, and a list of
requirements the CV does not evidence.

The master CV is never modified. Tailoring creates a new `Cv` row with
`kind: TAILORED`, linked to its source and to the job.

`omittedRequirements` is deliberately part of the contract and the prompt tells
the model not to leave it empty to be encouraging. Honest gaps are more useful
to a contractor than reassurance.

The UI offers three views: the tailored CV, the change list with reasons, and a
line-level diff against the original (`diffLines()`), so the user can see that
their history has not been quietly rewritten.

## Prompt versioning

`PROMPT_VERSION` in `src/lib/ai/prompts.ts`. Stored analyses record the version
that produced them. Bump it when a prompt changes materially; results from an
older version are then recomputed on next access rather than silently mixed.

## Model output is untrusted

Every response is parsed with `parseJsonResponse()` (which tolerates prose and
code fences around the JSON) and then validated with a Zod schema before it
touches the database. Arrays are length-capped. Strings are truncated.

## What the AI is not allowed to do

**It does not calculate match scores.** `src/lib/matching/engine.ts` is
deterministic arithmetic. Asking a model for a score would make it
irreproducible, unexplainable and untestable, all of which matter more here
than nuance. See `docs/architecture.md`.

**It does not send anything.** Recruiter messages and covering letters are
drafted and shown. The user sends them.

**It does not modify the profile.** It proposes; the user confirms.
