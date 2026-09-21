# Running it on your own machine (Docker)

Everything runs in containers: the application and its own PostgreSQL
database. You do not need Node.js, a database account or a server. Your CV and
your data stay on your computer.

Budget about 20 minutes the first time, most of it getting API keys.

## 1. Install Docker

- **Windows / Mac:** install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
  and start it. On Windows, accept the WSL 2 setup if it asks.
- **Linux:** install Docker Engine and the Compose plugin
  (`curl -fsSL https://get.docker.com | sh`).

Check it works:

```bash
docker compose version
```

## 2. Get the code

```bash
git clone <repository URL>
cd ai-job-hunter
```

## 3. Get your API keys

Use **your own** keys. They are tied to the account holder's usage limits and
billing, and should not be shared between people.

| Key | Needed for | Where |
| --- | --- | --- |
| Anthropic | Advert analysis, CV reading, tailoring, cover letters | [console.anthropic.com](https://console.anthropic.com) → API Keys. Pay-as-you-go; add a few pounds of credit. |
| Adzuna | Job search | [developer.adzuna.com](https://developer.adzuna.com) → register → App ID + App Key. Free. |
| Careerjet | A second job source (optional) | [careerjet.com/partners](https://www.careerjet.com/partners/) → publisher account. See the note below. |

The app starts and works without any of them — you just will not get job
search or AI features until they are filled in.

**Careerjet only accepts requests from IP addresses you have registered** in
the publisher account. Add your home broadband's public IP (search "what is my
IP"). If your provider changes it, Careerjet searches will start failing with
a message saying so; update the address and they recover. Adzuna has no such
restriction.

## 4. Configure

Copy the template:

```bash
cp .env.example .env
```

(Windows PowerShell: `Copy-Item .env.example .env`)

Generate a session secret — this uses Docker, so it works without Node
installed:

```bash
docker run --rm node:22-alpine node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Open `.env` in any text editor and set:

| Variable | Value |
| --- | --- |
| `AUTH_SECRET` | The value you just generated |
| `ALLOWED_SIGNUP_EMAILS` | Your own email address |
| `ANTHROPIC_API_KEY` | Your Anthropic key |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | Your Adzuna keys |
| `CAREERJET_API_KEY` | Optional |

**Leave `DATABASE_URL` as it is.** The Docker setup ignores it and uses its own
database container, whatever the file says.

`.env` is excluded from git. Never commit it.

## 5. Start

```bash
docker compose -f docker-compose.local.yml up --build
```

The first build takes a few minutes. It starts the database, creates the
schema, then starts the app. When you see a line like `Ready in ...`, open:

**<http://localhost:3000>**

Register with the address you put in `ALLOWED_SIGNUP_EMAILS`, choose a
password, and sign in. The first account created is the administrator.

Use Chrome, Edge or Firefox. The session cookie is marked secure, which those
browsers allow on `localhost`; if you are sent straight back to the login page
after signing in, try one of them.

## 6. First steps in the app

1. **My CV → Upload a CV** (PDF or Word). The AI extracts your roles and
   skills. **Review what it found before confirming** — it is a draft, and
   everything the app writes for you later is checked against what you confirm
   here.
2. **Jobs → search** for something like `test lead` or `QA automation`.
3. Open a job to see the match score and exactly how it was worked out. Adverts
   from job boards are cut short; paste the full advert from the original
   listing into the job page to get a far more accurate score.
4. **Analyse with AI**, then **Tailor your CV** or **Cover letter**. Anything the AI
   writes that is not supported by your CV is flagged before you use it.

## Day to day

```bash
# Start in the background (no rebuild)
docker compose -f docker-compose.local.yml up -d

# Stop. Your data is kept.
docker compose -f docker-compose.local.yml down

# Watch the application log
docker compose -f docker-compose.local.yml logs -f app

# After pulling new code
git pull
docker compose -f docker-compose.local.yml up -d --build
```

Updating re-runs the schema step automatically before the new version starts.

To save typing, you can set the file once per terminal session instead —
`export COMPOSE_FILE=docker-compose.local.yml` (PowerShell:
`$env:COMPOSE_FILE="docker-compose.local.yml"`) — then plain `docker compose up -d`
works.

## Where your data lives

Two Docker volumes: `db_data` (the database) and `uploads` (your CV files and
generated documents). They survive `down`, restarts and rebuilds.

To **delete everything** and start again:

```bash
docker compose -f docker-compose.local.yml down -v
```

`-v` removes the volumes. This is permanent.

To back up the database:

```bash
docker compose -f docker-compose.local.yml exec db pg_dump -U contracthunter contracthunter > backup.sql
```

## If something goes wrong

**`port is already allocated` / port 3000 in use** — something else is using
it. Stop that, or in `docker-compose.local.yml` change the first `3000` in
`"127.0.0.1:3000:3000"` to e.g. `3001`, set `APP_URL` there to
`http://localhost:3001`, and open that address instead.

**Errors mentioning `AUTH_SECRET`** — it is empty or shorter than 32
characters in `.env`. Generate one as in step 4.

**`migrate` fails** — run
`docker compose -f docker-compose.local.yml logs migrate` to see why. If it
says a change would lose data, it has stopped deliberately rather than delete
anything; ask before forcing it.

**"This application is invite-only"** — the address you registered with is not
in `ALLOWED_SIGNUP_EMAILS`. Add it, then
`docker compose -f docker-compose.local.yml up -d` to pick up the change.

**Job search returns nothing / an error about a source** — check the keys in
`.env`. For Careerjet, check your current IP is registered with them.

**AI features stop with a budget message** — raise
`AI_MONTHLY_BUDGET_PENCE` in `.env` (it is in pence: `50000` is £500).
