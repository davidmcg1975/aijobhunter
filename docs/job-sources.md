# Job sources

Every provider implements `JobSource` in `src/lib/jobsources/types.ts` and is
registered in `registry.ts`. Adding one is an adapter file plus one array
entry - nothing else in the application knows a provider by name.

## Current sources

| Source | Status | Access | Notes |
| --- | --- | --- | --- |
| Adzuna | Live | Documented public API, free tier | Trial licence - see `docs/adzuna.md` |
| Reed | Adapter written, **key unobtainable self-serve** | Documented API, but the sign-up link is dead | `REED_API_KEY` |
| Careerjet | **Live and verified** | Publisher API; source IP must be allow-listed | `CAREERJET_API_KEY` |
| JobServe | **Not implemented, deliberately** | No public API; automated access disallowed | See below |

## The rule: check how a provider permits access before writing an adapter

The technical work is easy - roughly 200 lines. The question that decides
whether an adapter should exist at all is whether the provider permits
programmatic access. Check, in this order:

1. A documented public API (Adzuna, Reed). Use it.
2. A partner or feed programme you can apply to. Apply, then use it.
3. `robots.txt` and the terms of service. If they disallow automated access to
   the listings, **stop**. Do not write a scraper.

## JobServe: why there is no adapter

JobServe is one of the best UK IT contract boards, so this is a real loss. It
was investigated and rejected on access grounds, not technical ones.

**There is no official public API.** An unofficial .NET client exists on
GitHub, explicitly "neither produced by, officially endorsed by, or supported
by JobServe Ltd". Third-party scrapers are sold on scraping platforms. Neither
is permission.

**Their `robots.txt` disallows exactly what an adapter would need.** Checked
September 2026:

```
Disallow: /Job-Search.aspx      <- the job search interface
Disallow: /*.jsap
Disallow: /*.jsrs               <- the internal data endpoints
Disallow: /*.jcv
Disallow: /JobSavedSearch/
User-agent: GPTBot
Disallow: /                     <- AI crawlers blocked outright
```

`/Job-Search.aspx` is disallowed for every user-agent, and the `.jsap` /
`.jsrs` / `.jcv` patterns cover the internal endpoints the unofficial client
calls. They also block AhrefsBot, SemrushBot, MJ12bot, PetalBot, Amazonbot and
GPTBot from the whole site. This is not ambiguous: they do not want automated
retrieval of their listings.

Building it anyway would mean ignoring a clearly stated position, would risk
the user's IP and account, and would be indefensible the moment this became a
service other people use.

### The legitimate route

JobServe integrates with recruitment platforms (JobAdder, Firefish among
others), so a partner channel exists. **Ask them.** Contact JobServe, describe
the use case - a tool that helps an individual contractor find and apply for
roles, sending traffic to their adverts - and ask whether they offer a feed or
API for it.

If they say yes, the adapter is a couple of hours' work and slots in with no
changes anywhere else. That is the point of the interface.

## Reed

Documented API at <https://www.reed.co.uk/developers>.

**Checked September 2026: the key cannot currently be obtained self-serve.**
The docs still say "Sign up for a reed.co.uk API Key" and show a *Register*
link, but that link points at `#` - it is a placeholder with no destination.
The adapter is written and correct; it stays inert until a key exists, and the
route to one is to contact Reed directly rather than to follow the docs.

This is worth remembering as a general lesson: published API documentation is
not evidence that access is available. Only a key in hand is.

- Auth: HTTP Basic, API key as the username, empty password
- Search: `GET https://www.reed.co.uk/api/1.0/search`
- Useful parameters: `keywords`, `locationName`, `distanceFromLocation`,
  `contract`, `permanent`, `minimumSalary`, `resultsToTake` (max 100),
  `resultsToSkip`

Two wrinkles the adapter handles:

- **No OR search.** Reed has no equivalent of Adzuna's `what_or`, so
  `keywordMode: "any"` degrades to the same keyword string rather than
  silently returning nothing.
- **Summary descriptions.** Like Adzuna, the search endpoint returns a
  summary rather than the full advert, so `descriptionTruncated` is set and the
  paste-the-advert flow applies.

Salary is annual, converted with the same `providerSalaryToDayRate()` used for
Adzuna, and the search endpoint does not return contract type - the `contract`
parameter filters instead, so `contractType` stays `UNKNOWN` rather than being
guessed.

## Careerjet

Aggregator with a [publisher API](https://www.careerjet.com/partners/api/).
Two things make it the best remaining candidate for UK contracting:

- **Native contract filtering** (`contracttype=c`), rather than the boolean
  flags Adzuna and Reed expose.
- **An explicit salary period** (`salary_type`: Y/M/W/D/H). Every other source
  forces the day-rate-versus-annual question to be guessed from magnitude; here
  it is stated, so `normaliseToDayRate()` converts exactly. Weekly is left
  `UNKNOWN` because converting it would mean guessing days worked.

Three wrinkles the adapter handles:

- **No usable job id.** See "The advert URL cannot be used as an identity"
  below — this is the one that will bite anyone who assumes otherwise.
- **Errors arrive as HTTP 200** with an error body, so the response type is
  checked rather than just the status code.
- **A `Referer` header is mandatory**, on top of the API key. See below.

`user_ip` and `user_agent` are mandatory parameters on every request. The
search is server-initiated, so the server's own values are sent — no user IP is
forwarded to a job board.

### Getting access: two gates, in order

Careerjet checks two things, and only reveals the second once the first passes.

1. **Source IP.** An authenticated request from an unregistered address returns
   `403 { "error": "Unauthorized access from IP <address>" }`. Fixed by
   allow-listing that address in the publisher account — nothing in a request
   can satisfy it.
2. **Referer header.** Once the address is allowed, a request without one
   returns `403 { "error": "Undeclared referrer. Please add a Referer header." }`
   Any value is accepted (localhost, an unrelated https URL — all tested and
   all returned 200), so the adapter sends `APP_URL`, which declares the
   deployment honestly rather than spoofing something.

Two practical consequences: a home broadband address is usually dynamic, so an
allow-listed entry stops working when it changes, and serverless hosting has no
fixed outbound address either. This model suits a server with a static IP.

### The advert URL cannot be used as an identity

This is the trap worth knowing about. Careerjet returns no job id, so the
obvious key is the advert URL — and it is wrong.

The URL is a `jobviewtrack.com` redirect whose entire path token is regenerated
per request. Measured: two identical searches 2.5 seconds apart returned
**different URLs for all ten adverts**, with no query string to strip.

```
1st: https://jobviewtrack.com/v2/UTeiGTgyjlAe1hxE9QVaFcSgf2xjzA9htbEiE7Fh9Il5...
2nd: https://jobviewtrack.com/v2/bK30UE80Fjrj4RpuixbkkcLIJj1op5jQJhvvkRTa3rYv...
```

Keying on it would re-import every advert as new on every search. Instead
`careerjetJobId()` hashes the normalised title, company and location, which are
stable across requests. Verified end to end: running the identical search twice
reports **"Found 60 adverts: 0 new"**, and 86 stored Careerjet rows contain 86
distinct ids and zero repeated adverts.

### Verified behaviour of the live API

Confirmed against the live API, 20 September 2026:

- **Fields returned**: `company, date, description, locations, salary, site,
  title, url`. There is no job id and no contract-type echo, so `contractType`
  stays `UNKNOWN` rather than being assumed from the filter that was sent.
- **`salary_type` works as documented.** Observed `"£725 per day"` with
  `salary_min: 725, salary_type: "D"`, which converts exactly. Only about a
  quarter of adverts carry a structured salary at all (5 of 20 on one page), so
  the advert text remains the primary source.
- **Dates are RFC 1123**, e.g. `"Sat, 19 Sep 2026 06:30:55 GMT"` — not the
  `DD/MM/YYYY` the documentation suggested. `Date` parses that natively; the
  `DD/MM/YYYY` branch is kept because `Date` would read that form as US
  month-first.
- **Descriptions are 130–300 characters** — shorter even than Adzuna's 500, so
  `descriptionTruncated` is always set and the paste-the-advert flow matters
  more here than anywhere else.
- **Relevance is loose.** A "test analyst" contract search returned "Credit
  functional analyst" and "Senior YouTube Analyst". The unassessable-skills
  score cap is what stops those surfacing as good matches.

### Historical: the two 403s, for reference

The auth method is confirmed correct — omitting it returns a clear 401 telling
you to use HTTP Basic with the key as the username. Before the address was
allow-listed, every authenticated request returned:

```
403 { "error": "Unauthorized access from IP <caller address>", "type": "ERROR" }
```

The key is recognised. The **calling address** is not on Careerjet publisher
account allow-list. Seven variations were tried and all returned the identical
403: with and without a Referer header, with a browser User-Agent, with a real
public address in `user_ip`, and with those parameters omitted entirely. The
v3 endpoint fails differently ("Undeclared referrer"), which confirms the v4
check is on the source address rather than the referrer.

**Nothing in this codebase can work around it.** It is fixed in the publisher
account by allow-listing the address the error names.

Two things to know before relying on it:

- A home broadband address is usually dynamic, so an allow-listed entry will
  stop working when the address changes.
- Serverless hosting does not have a fixed outbound address either, so this
  model fits a server with a static IP rather than a Vercel deployment. Worth
  settling with Careerjet before depending on the source.

The adapter itself remains unverified against a successful response: the
request and response shapes come from the documentation, and the field mapping
should be checked on the first call that gets through.

## Other candidates

- **CV-Library** - has a partner API; requires an application.
- **CWJobs / Totaljobs** (Stepstone) - no public jobseeker API found; likely
  the same position as JobServe. Check before building.
- **Indeed** - closed their publisher API to new applicants; do not assume old
  tutorials still apply.

Check each one's terms independently. Several explicitly forbid storing or
re-serving listings, which this application does by design.
