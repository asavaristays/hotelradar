#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANCH="${1:-main}"

cd "$ROOT_DIR"

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

echo "[deploy] Branch: $BRANCH"

git fetch --all --prune
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "[deploy] Installing backend dependencies"
npm ci

echo "[deploy] Running backend tests"
npm test

echo "[deploy] Running backend migrations"
npm run db:migrate

echo "[deploy] Installing frontend dependencies"
npm --prefix frontend ci

echo "[deploy] Building frontend"
npm --prefix frontend run build

echo "[deploy] Reloading PM2"
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save

echo "[deploy] Completed successfully"
