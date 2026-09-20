# Deployment

## What this application needs

Not a PHP app. It needs all of:

| Requirement | Why |
| --- | --- |
| **Node.js 20+** | Next.js 16 will not run on older runtimes |
| **A long-running process** | `next start` is a server, not a set of files to upload |
| **~1 GB RAM to build** | `next build` is the memory-hungry step; the running server needs far less |
| **Outbound HTTPS** | Adzuna, Careerjet and the Anthropic API are all called from the server |
| **A writable directory, or object storage** | Uploaded CVs (`STORAGE_DRIVER`) |
| **A static outbound IP** | Careerjet allow-lists the calling address — see below |

The last one is the constraint that decides the hosting, and it is easy to
miss until the day it fails.

## The Careerjet / serverless conflict

Careerjet authorises by **source IP**: the address the request comes from must
be registered in the publisher account. Serverless platforms (Vercel, Netlify,
Cloudflare) do not give you a fixed outbound address on their standard plans,
so Careerjet will start returning 403 as soon as the platform routes a request
from a different address.

That leaves three honest options:

1. **A small VPS** (Hetzner, DigitalOcean, Linode — roughly £4–6/month). Static
   IP, real Node runtime, no surprises. **This is the recommended target.**
2. **Vercel, without Careerjet.** Everything else works; Adzuna has no IP
   restriction. Add Careerjet later behind a proxy with a fixed address.
3. **Shared hosting** — only if it genuinely offers Node.js application
   support. See below.

## Shared hosting (cPanel and similar)

Sometimes viable, often not. Check these before committing:

- **Is there a "Setup Node.js App" tool?** (cPanel with Passenger.) Without it,
  there is no way to run this at all.
- **What Node version does it offer?** It must be 20 or newer.
- **Can you run `npm run build` on the server, or must you upload a build?**
  Some hosts kill long-running shell commands or cap memory below what the
  build needs.
- **Is the outbound IP static, and is it yours?** On shared hosting the address
  is shared with other customers and the host may migrate you to a different
  server, which silently breaks the Careerjet allow-list.
- **Does it allow outbound HTTPS to arbitrary hosts?** Some shared hosts block
  or proxy outbound connections, which would break every API call.

If the answer to the first is no, stop — use a VPS.

## Before it is reachable from the internet

Work through all of these. The first two are not optional: this application
stores CVs, employment history and contact details.

1. **`ALLOWED_SIGNUP_EMAILS`** — set it to the addresses allowed to register.
   Empty means anybody who finds the URL can create an account and upload a CV.
2. **`AUTH_SECRET`** — a fresh 32+ character random value, not the development
   one.
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
3. **`APP_URL`** — the real public URL. It goes into email links and is sent as
   the Referer header Careerjet requires.
4. **HTTPS**, with a redirect from HTTP. Sessions are `secure` cookies in
   production and will not work over plain HTTP.
5. **`STORAGE_DRIVER`** — `local` needs a persistent writable directory that
   survives deploys. On any platform with an ephemeral filesystem, use
   `vercel-blob` or add an S3-compatible driver.
6. **Rotate every credential** that has been pasted into a chat, a ticket or a
   commit: database password, Adzuna key, Careerjet key, Anthropic key.
7. **Database backups** — confirm they are switched on at the provider.
8. **Complete the privacy policy and terms.** Both are templates with
   `[OPERATOR NAME]` placeholders. The privacy policy commits to UK GDPR and
   names the data processors.
9. **Resolve the Adzuna licence question** (`docs/adzuna.md`). The free
   allowance is for personal research; a second user makes that a licensing
   question.
10. **Configure `SMTP_URL`**, or password resets and email verification only
    ever get written to the server log — so a forgotten password cannot be
    recovered without an administrator.
11. **`CRON_SECRET`**, if scheduled fetching is wanted, and point a scheduler at
    `/api/cron/fetch-jobs`.

## Running it

```bash
npm ci
npm run db:push          # first deploy only; use db:migrate once live
npm run build
npm start                # serves on PORT, default 3000
```

Put nginx, Apache or the host's proxy in front for TLS and to forward to the
Node process. The app trusts `x-forwarded-for` for rate limiting and audit
logging, so the proxy must set it.

## Registering the two accounts

Registration is open to the addresses in `ALLOWED_SIGNUP_EMAILS`, and each
person sets their own password on the register page. There is no invite email,
so **register both accounts immediately after the first deploy**, before the URL
is shared any further. Once both addresses are taken, registration is closed in
practice as well as in policy.

The first account created becomes the administrator.
