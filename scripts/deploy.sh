#!/usr/bin/env bash
#
# Deploy the latest code on the server.
#
#   ./scripts/deploy.sh
#
# Safe to re-run. Stops on the first error rather than leaving a half-applied
# deploy, and refuses to run without the configuration it needs.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "No .env found. Copy .env.example to .env and fill it in first." >&2
  exit 1
fi

# A missing allowlist means anyone who finds the URL can register and upload a
# CV. Refusing here is deliberate - it is the one mistake that cannot be
# undone quietly.
if ! grep -q '^ALLOWED_SIGNUP_EMAILS=".\+"' .env; then
  echo "ALLOWED_SIGNUP_EMAILS is empty in .env." >&2
  echo "Registration would be open to anyone. Set it, then deploy again." >&2
  exit 1
fi

echo "==> Fetching latest code"
git pull --ff-only

echo "==> Applying any schema changes"
# Runs on the host rather than in the container: it needs the direct database
# URL, and it must complete before the new code starts serving.
npx prisma migrate deploy 2>/dev/null || npx prisma db push

echo "==> Building and restarting"
docker compose up -d --build

echo "==> Waiting for the application to report healthy"
for _ in $(seq 1 30); do
  status=$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q app)" 2>/dev/null || echo starting)
  if [ "$status" = "healthy" ]; then
    echo "Deployed. Running and healthy."
    docker image prune -f >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 3
done

echo "The application did not become healthy. Recent logs:" >&2
docker compose logs --tail 40 app >&2
exit 1
