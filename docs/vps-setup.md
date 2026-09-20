# Setting up the server

A one-off walkthrough for a fresh Ubuntu VPS. Budget about 30 minutes.

Everything runs in two containers: the application, and Caddy in front of it
for TLS. Caddy obtains and renews the certificate itself, which removes the
part of self-hosting that most often breaks six months later.

## 1. Create the server

Any provider with a **static IPv4 address** will do — Hetzner CX22 (~£4/month)
or DigitalOcean's $6 droplet are both ample. Choose:

- **Ubuntu 24.04 LTS**
- A **London or EU region**, to match where the database and the CV data live
- **Add your SSH key** during creation; you will not need a password

Write down the IP address. You need it twice: for DNS, and for the Careerjet
allowlist.

## 2. Point the domain at it

In your DNS provider, add an A record:

```
jobs.auraplayvr.com.   A   <your server IP>
```

Do this **before** starting the application. Caddy asks Let's Encrypt for a
certificate on first start, and that fails if the name does not yet resolve to
this server. Give it a few minutes to propagate.

The subdomain keeps this entirely separate from the existing auraplayvr.com
site, which stays where it is.

## 3. Prepare the server

```bash
ssh root@<your server IP>

# Updates, then Docker.
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh

# A non-root user to run the application.
adduser --disabled-password --gecos "" contracthunter
usermod -aG docker contracthunter
rsync --archive --chown=contracthunter:contracthunter ~/.ssh /home/contracthunter/

# Only SSH and web traffic.
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# Unattended security updates, so the box does not rot.
apt install -y unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades
```

Then log back in as the new user — everything below runs as `contracthunter`,
not root:

```bash
ssh contracthunter@<your server IP>
```

## 4. Get the code

```bash
sudo apt install -y git
git clone https://github.com/<you>/ai-contract-hunter.git
cd ai-contract-hunter
```

For a private repository, generate a key with `ssh-keygen -t ed25519`, add
`~/.ssh/id_ed25519.pub` to GitHub as a **deploy key**, and clone over SSH
instead.

## 5. Configure

```bash
cp .env.example .env
nano .env
```

Set at minimum:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** connection string |
| `DATABASE_URL_DIRECT` | Neon **direct** string, with `&channel_binding=require` removed |
| `AUTH_SECRET` | A fresh secret — see below |
| `APP_URL` | `https://jobs.auraplayvr.com` |
| `ALLOWED_SIGNUP_EMAILS` | The two addresses allowed to register |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | From developer.adzuna.com |
| `CAREERJET_API_KEY` | From your publisher account |
| `ANTHROPIC_API_KEY` | From console.anthropic.com |
| `STORAGE_DRIVER` | `local` — the `./storage` directory is a mounted volume |

Generate the session secret **on the server**, so it never travels:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Then set the hostname Caddy should request a certificate for:

```bash
nano Caddyfile     # replace jobs.auraplayvr.com if you chose a different name
```

## 6. Tell Careerjet about this address

Add the **server's IP** to the allowed list in your Careerjet publisher
account. This is the whole reason for choosing a VPS over serverless: the
address is static, so the allowlist entry keeps working.

Adzuna has no such restriction.

## 7. Create the schema and start

```bash
npx prisma db push      # first time only
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

The first build takes a few minutes. Caddy will fetch a certificate as it
starts; `docker compose logs caddy` shows how that went.

Then open `https://jobs.auraplayvr.com` and **register both accounts
immediately**, before sharing the URL. Until an address is claimed, anyone who
knows it could claim it first. The first account created becomes the
administrator.

## Running it day to day

```bash
./scripts/deploy.sh              # pull, migrate, rebuild, restart, verify
docker compose logs -f app       # follow the application log
docker compose logs -f caddy     # certificate and proxy issues
docker compose restart app       # restart without rebuilding
docker compose down              # stop everything
```

`deploy.sh` refuses to run if `ALLOWED_SIGNUP_EMAILS` is empty, and fails
loudly with recent logs if the new container does not come up healthy.

## Scheduled job fetching (optional)

To have jobs pulled in overnight rather than only when someone searches, set
`CRON_SECRET` in `.env` and add to the user's crontab (`crontab -e`):

```
0 7 * * * curl -fsS -H "Authorization: Bearer <CRON_SECRET>" https://jobs.auraplayvr.com/api/cron/fetch-jobs >/dev/null
```

Note that this only runs **saved searches**, and there is currently no UI to
create one — so it will do nothing until that is built.

## What you are taking on

Being honest about the trade you made by choosing a VPS over Vercel:

- **Security updates.** `unattended-upgrades` handles the OS. Docker images and
  npm dependencies are on you — `npm audit` occasionally, and rebuild.
- **Backups.** The database is Neon's problem (check point-in-time recovery is
  on). The `./storage` directory holding uploaded CVs is **yours**, and nothing
  currently backs it up. The CVs also exist on your own machines, so this is a
  convenience rather than a disaster, but worth an `rsync` to somewhere if the
  app becomes the only copy.
- **Monitoring.** Nothing tells you if the site goes down. A free uptime
  checker pointed at `https://jobs.auraplayvr.com/login` covers it.

None of this is heavy for two users. It is just not zero, which Vercel would
have been.
