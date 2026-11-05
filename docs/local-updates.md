# Optional updates from the Admin page

The host helper is a separate Node.js process. After setup, open **Admin →
Updates**, click **Check for updates**, then **Refresh status**. If there is
an update, the install button identifies the Git commit it will install.
Automatic checks can be enabled from the same screen. They run hourly while
the helper is running and reset to off when it restarts. Every installation
requires an admin click.

Install the helper in an existing checkout of this repository on `main`
with `origin` set to its GitHub HTTPS URL. The checkout must be clean to
install. The helper only accepts a fast-forward update from that remote.

## Local Docker on Windows

Start Docker Desktop and make sure Node.js 22 or later is installed on
Windows. Open two PowerShell windows in the app's repository folder.

### 1. Start the helper in the first window

```powershell
git pull --ff-only
if ($LASTEXITCODE -ne 0) { throw "Git pull failed. Resolve the error before continuing." }
$env:UPDATE_MODE = 'docker'
$env:UPDATE_MAILBOX = Join-Path $env:LOCALAPPDATA 'AIContractHunter\updates'
node .\scripts\update-host.mjs
```

Wait for **Update helper ready in docker mode** and leave this window open.
It shows the installation log. After restarting Windows, run the last three
lines again to bring the helper back online.

### 2. Connect Docker in the second window

```powershell
$env:UPDATE_MAILBOX = Join-Path $env:LOCALAPPDATA 'AIContractHunter\updates'
docker compose -f docker-compose.local.yml -f docker-compose.updates.yml up -d --build
```

This is a one-time setup. Docker reuses the existing database and CV uploads.
Use both Compose files if you later run Compose commands manually.

### 3. Check for updates in the app

1. Open [the app](http://localhost:3000) and sign in as an admin.
2. Go to **Admin → Updates** and click **Check for updates**.
3. Click **Refresh status** after a few seconds. If an update is available,
   click **Install update** when you're ready for the app to restart.

To turn off the helper, press **Ctrl+C** in the first window once any
installation has finished. The app can still run with the helper stopped.

## Local Docker on macOS

Start Docker Desktop and make sure Node.js 22 or later is installed on
your Mac. Open two Terminal tabs in the app's repository folder.

### 1. Start the helper in the first tab

```sh
export UPDATE_MODE=docker
export UPDATE_MAILBOX="$HOME/Library/Application Support/AIContractHunter/updates"
git pull --ff-only && node scripts/update-host.mjs
```

Wait for **Update helper ready in docker mode** and leave this tab open.
It shows the installation log. Run these commands again after restarting
your Mac to bring the helper back online.

### 2. Connect Docker in the second tab

```sh
export UPDATE_MAILBOX="$HOME/Library/Application Support/AIContractHunter/updates"
docker compose -f docker-compose.local.yml -f docker-compose.updates.yml up -d --build
```

This is a one-time setup. Docker reuses the existing database and CV uploads.
Use both Compose files if you later run Compose commands manually.

### 3. Check for updates in the app

1. Open [the app](http://localhost:3000) and sign in as an admin.
2. Go to **Admin → Updates** and click **Check for updates**.
3. Click **Refresh status** after a few seconds. If an update is available,
   click **Install update** when you're ready for the app to restart.

To turn off the helper, press **Control+C** in the first tab after any
installation has finished. The app can still run with the helper stopped.

## Local Docker on Linux

Use Node.js 22 or later on the host and set `UPDATE_MAILBOX` to an absolute
path to a dedicated directory outside the checkout. Give the app and the
helper read and write access to that directory. Keep other users and services
out of it. Anything that can write to the mailbox can request an installation.
Run the helper under the account that normally updates and operates the app.
Its terminal output is the installation log.

From the repository folder, run `git pull --ff-only`, then start the helper
with `UPDATE_MODE=docker node scripts/update-host.mjs`. Leave it running.
In a second terminal in the same folder, export the same `UPDATE_MAILBOX`
and run:

```sh
docker compose -f docker-compose.local.yml -f docker-compose.updates.yml up -d --build
```

The app container needs write access to the mailbox as UID 1001 on Linux.
Use a shared group or an ACL for that UID and the host helper account. Then
follow the macOS instructions for checking for updates in the app.

## Node.js

Use Node.js 22 or later. Choose a dedicated mailbox directory outside the
checkout that only the helper and app can access.

Set `UPDATE_MAILBOX` in both the app's and helper's environments. Set
`UPDATE_STOP` and `UPDATE_START` in the helper's environment to absolute
paths to two Node.js scripts outside the checkout. These scripts are specific
to the process manager you use. The stop script must return success only after
the app process and its children have exited cleanly. The start script should
ask your process manager to start the app and return success once it is
running. Both scripts receive the checkout as their working directory.
Run `node scripts/update-host.mjs` in a separate terminal or as a host
service and keep it running across app restarts.

- **Development with PGlite** uses `UPDATE_MODE=dev-pglite`. Manage
  `npm run dev` with the hooks. The helper stops it before installing
  dependencies, generating Prisma and running `npm run db:local`.
- **Production with PostgreSQL** uses `UPDATE_MODE=production`. Manage
  `npm start` with the hooks. The helper stops it, installs dependencies,
  runs the production build and applies checked-in Prisma migrations via
  `prisma migrate deploy`. The PostgreSQL database must already be set up
  and any connection variables needed for migration must be available to the
  helper. Releases with a schema change need a PostgreSQL migration before
  they can be installed this way.

## If installation fails

Read the helper's terminal output. An installation can advance the checkout
before a build or migration fails. Finish the failed step on the host and
start the app using the same Compose command or Node.js start hook. For
PGlite, confirm the app has fully stopped before retrying a database step.
If the helper was killed and left a `host.lock` file, remove it only after
confirming the helper and all of its update commands have exited.
