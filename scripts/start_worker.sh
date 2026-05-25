#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
elif [[ -f "shared/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source shared/.env
  set +a
fi

exec node src/scripts/runRecalcWorker.js
