# Adzuna integration

## The licensing question — read this first

Adzuna's API is free to use for **personal research**, with a documented
allowance in the region of 25 calls/minute, 250/day, 1,000/week and
2,500/month. Their terms distinguish that from **commercial use**, which can
require a licence after a trial period.

This matters here specifically because:

- The moment a second person has an account, this stops being one developer
  doing personal research.
- The application is designed to be publicly accessible.
- Job data is stored locally and re-served, not just displayed once.

**Before opening this application to anyone beyond yourself, get written
confirmation from Adzuna about your use case.** This is a business decision, not
a technical one, and no amount of careful rate limiting makes an unlicensed
commercial use compliant.

The configuration reflects this as a first-class setting:

```
ADZUNA_LICENCE_MODE="personal"   # or "licensed"
ADZUNA_DAILY_CALL_LIMIT="200"
```

`ADZUNA_LICENCE_MODE` is currently a declaration of intent rather than an
enforcement point. If the application is opened to public sign-up, wire it into
a check that refuses to run scheduled fetches while it is still `personal`.

## Credentials

Register at <https://developer.adzuna.com/> for an `app_id` and `app_key`.

```
ADZUNA_APP_ID="..."
ADZUNA_APP_KEY="..."
ADZUNA_COUNTRY="gb"
```

These are read only in `src/lib/jobsources/adzuna.ts`, from `process.env`, on
the server. They are never sent to the browser, never included in an error
message, and never written to a log. The `SourceFetchLog` table deliberately
records the status code and query rather than the request URL, because the URL
contains the key.

## Endpoint

```
GET https://api.adzuna.com/v1/api/jobs/{country}/search/{page}
```

Parameters used by the adapter:

| Parameter          | Purpose                                        |
| ------------------ | ---------------------------------------------- |
| `app_id`, `app_key`| authentication                                 |
| `what`             | keywords                                       |
| `where`            | location                                       |
| `distance`         | radius in miles                                |
| `salary_min`       | minimum salary (annualised — see below)        |
| `max_days_old`     | recency                                        |
| `contract`         | contract roles only                            |
| `results_per_page` | capped at 50                                   |
| `sort_by`          | `date` or `salary`                             |

## Rate limiting

`assertWithinDailyAllowance()` counts rows in `SourceFetchLog` over a rolling
24 hours and refuses the call once `ADZUNA_DAILY_CALL_LIMIT` is reached. The
default of 200 sits deliberately below the documented 250/day so a scheduled
job cannot exhaust the allowance and leave interactive searches broken.

Every call is logged whether it succeeds or fails, so the count reflects real
consumption.

## Verified live behaviour (3 September 2026)

Three things were confirmed against the live API with real credentials. All
three contradict the obvious reading of the documentation, and all three
changed the code.

### 1. Descriptions are a 500-character extract, not the advert

This is the most consequential limitation in the whole application.

The search endpoint returns `description` truncated to 500 characters, ending
in an ellipsis, cut mid-sentence. Measured across a sample: **20 of 20 adverts
were exactly ~500 characters.** The response contains no other text field:

```
contract_type, created, salary_min, salary_max, salary_is_predicted,
description, __CLASS__, category, redirect_url, company, location, title, id
```

There is no full-text field to request. The full advert exists only behind
`redirect_url`, and scraping that is a separate licensing question.

Consequences, which are designed around rather than hidden:

- `Job.descriptionTruncated` is set at ingest.
- The AI analysis prompt is told it is reading a fragment, and explicitly told
  **not** to infer that a requirement is absent just because it does not appear.
  Without this the model reports false absences and every match score inherits
  the error.
- The job detail page tells the user plainly and points them at the original.
- Skill extraction is thin: roughly **0.7 recognised skills per advert**, against
  the 5–15 a full advert would yield.

Detection rates from the extract alone: IR35 7/20, remote working 13/20,
contract length 8/16. Usable, but not the same as reading the advert.

If full advert text matters, that is a conversation with Adzuna about a higher
tier, or a different source — not something to fix in code.

### 2. `what` is an AND, and it silently returns nothing

Measured counts for the same underlying market:

| Query | Results |
| --- | --- |
| `what="test analyst QA"` + contract + 14 days | **0** |
| `what="test analyst"` + London + contract + 14 days | 8 |
| `what="test analyst"` + London + contract | 18 |
| `what_or="test analyst QA"` + London + contract | 3,328 |
| `what_phrase="test analyst"` + London + contract | 5 |

A natural three or four word search plus a contract filter returns **zero
results with no error**, which reads as "no jobs exist" rather than "your query
was too strict". The adapter therefore supports `keywordMode`
(`all` / `any` / `phrase` → `what` / `what_or` / `what_phrase`) and the search
UI defaults to **any**.

### 3. Contract salaries are not consistently annualised

Two adverts, both `contract_type=contract`, in the same response:

```
salary_min: 130000   -> genuinely annualised   (£591/day)
salary_min: 300      -> already a day rate     (£300/day)
```

Dividing both by 220 turned the second into **£1/day**. `providerSalaryToDayRate()`
now selects by magnitude — hourly, day rate, or annual — and returns `null` in
the ambiguous £2,500–£15,000 band rather than producing a confident wrong
number. Regression tests use these exact observed values.

## The day-rate problem

This is the single most important normalisation detail, and getting it wrong
makes every rate in the application wrong by a factor of about 220.

Adzuna annualises everything. A £500/day contract is commonly reported as
`salary_min: 110000`. UK contractors think exclusively in day rates.

The adapter therefore:

1. Looks for a rate stated in the advert text first, via
   `parseRateFromText()`. An explicitly quoted "£500 - £550 per day" is always
   preferred, because it is what the recruiter actually wrote.
2. Falls back to Adzuna's figure, dividing by `WORKING_DAYS_PER_YEAR` (220)
   when the role is a contract.
3. Marks the result `salaryIsPredicted` when it came from Adzuna's own
   prediction rather than the advert, so the UI can label it "estimated".

When searching, the reverse conversion is applied: a user's £450/day minimum
becomes `salary_min=99000`.

A bare figure in the advert (`"Rate: £450"`) is treated as a day rate when it
falls in the 80–3000 band, and as an annual salary above 15,000. That heuristic
is covered by tests in `tests/parse.test.ts`.

## What Adzuna does not give us

Neither IR35 status nor contract length is a structured field, and both are
critical to a UK contractor. They are extracted twice:

- **Deterministically at ingest** by `detectIr35()` and `parseContractMonths()`,
  so search and filtering work without an AI call. `detectIr35()` deliberately
  returns `UNKNOWN` when an advert mentions both inside and outside, because a
  wrong IR35 label costs the contractor real money.
- **By AI on demand** in `analyseJob()`, which also extracts requirements,
  responsibilities and seniority.

The advert's own structured fields always win over the model's reading of them.

## Adding another provider

Nothing above is visible outside `src/lib/jobsources/`. To add JobServe, Reed,
CWJobs or CV-Library:

1. Write an adapter implementing `JobSource` that returns `NormalisedJob[]`.
2. Add it to the `SOURCES` array in `registry.ts`.
3. Nothing else changes. Deduplication across sources already works via
   `fingerprint()` plus description similarity.

Check each provider's terms separately. Several explicitly forbid storing or
re-serving their listings, which this application does by design.
