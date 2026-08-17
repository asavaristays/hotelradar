#!/usr/bin/env bash
# Deploy HotelRADAR Direct to the shared VPS without touching Asavari/website volumes.
# Run from local machine: ./scripts/vps-deploy.sh
# Optional: ROLLBACK_TAG=release-YYYYMMDDTHHMMSSZ ./scripts/vps-deploy.sh --rollback
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${VPS_HOST:-vps-webtechnosys}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/hotelradar-direct}"
ENV_FILE_REMOTE="/etc/hotelradar-direct/env"
PROJECT="hotelradar-direct"
API_HEALTH="http://127.0.0.1:4101/healthz"
API_READY="http://127.0.0.1:4101/readyz"
WEB_HEALTH="http://127.0.0.1:4100/"

MODE="deploy"
if [[ "${1:-}" == "--rollback" ]]; then
  MODE="rollback"
fi

ensure_remote_docker() {
  ssh "$HOST" "bash $REMOTE_DIR/scripts/vps-ensure-docker-sock.sh"
}

wait_healthy() {
  local tries=30
  for i in $(seq 1 "$tries"); do
    if ssh "$HOST" "curl -fsS '$API_HEALTH' >/dev/null && curl -fsS '$API_READY' >/dev/null && curl -fsS -o /dev/null '$WEB_HEALTH'"; then
      echo "health_ok attempt=$i"
      return 0
    fi
    sleep 2
  done
  echo "health_failed after ${tries} attempts" >&2
  return 1
}

if [[ "$MODE" == "rollback" ]]; then
  TAG="${ROLLBACK_TAG:-}"
  if [[ -z "$TAG" ]]; then
    TAG="$(ssh "$HOST" "cat $REMOTE_DIR/releases/current 2>/dev/null || true")"
    # previous tag = second-from-last in history
    TAG="$(ssh "$HOST" "tail -n 2 $REMOTE_DIR/releases/history 2>/dev/null | head -n 1")"
  fi
  if [[ -z "$TAG" ]]; then
    echo "No ROLLBACK_TAG / release history found" >&2
    exit 1
  fi
  echo "Rolling back to $TAG"
  ensure_remote_docker
  ssh "$HOST" "set -e
    cd '$REMOTE_DIR'
    for img in api worker web; do
      docker tag '${PROJECT}_'\"\$img\":'$TAG' '${PROJECT}_'\"\$img\":latest
    done
    docker-compose -p '$PROJECT' --env-file '$ENV_FILE_REMOTE' up -d
  "
  wait_healthy
  echo "Rollback complete: $TAG"
  exit 0
fi

# --- normal deploy ---
rsync -az --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude .env \
  --exclude .env.deploy \
  --exclude .env.README \
  --exclude output \
  --exclude '*.pdf' \
  --exclude .next \
  --exclude dist \
  --exclude releases \
  -e ssh \
  "$ROOT/" "$HOST:$REMOTE_DIR/"

# Sync secrets from local .env.deploy into /etc (never leave secrets only in app tree)
if [[ -f "$ROOT/.env.deploy" ]]; then
  scp "$ROOT/.env.deploy" "$HOST:/tmp/hotelradar-direct.env.incoming"
  ssh "$HOST" "set -e
    sudo /bin/mkdir -p /etc/hotelradar-direct
    sudo /bin/chown deploy:deploy /etc/hotelradar-direct
    sudo /bin/chmod 700 /etc/hotelradar-direct
    # preserve backup key if already present
    if [[ -f '$ENV_FILE_REMOTE' ]] && grep -q '^BACKUP_ENCRYPTION_KEY=' '$ENV_FILE_REMOTE'; then
      KEY_LINE=\$(grep '^BACKUP_ENCRYPTION_KEY=' '$ENV_FILE_REMOTE')
      cp /tmp/hotelradar-direct.env.incoming '$ENV_FILE_REMOTE'
      if ! grep -q '^BACKUP_ENCRYPTION_KEY=' '$ENV_FILE_REMOTE'; then
        echo \"\$KEY_LINE\" >>'$ENV_FILE_REMOTE'
      fi
    else
      cp /tmp/hotelradar-direct.env.incoming '$ENV_FILE_REMOTE'
    fi
    chmod 600 '$ENV_FILE_REMOTE'
    rm -f /tmp/hotelradar-direct.env.incoming
    ln -sfn '$ENV_FILE_REMOTE' '$REMOTE_DIR/.env'
  "
fi

ensure_remote_docker

TAG="release-$(date -u +%Y%m%dT%H%M%SZ)"
ssh "$HOST" "set -e
  cd '$REMOTE_DIR'
  chmod +x scripts/*.sh
  docker-compose -p '$PROJECT' --env-file '$ENV_FILE_REMOTE' build
  # tag previous latest for rollback before switching
  mkdir -p releases
  PREV=\$(cat releases/current 2>/dev/null || true)
  for img in api worker web; do
    if [[ -n \"\$PREV\" ]] && docker image inspect '${PROJECT}_'\"\$img\":latest >/dev/null 2>&1; then
      docker tag '${PROJECT}_'\"\$img\":latest '${PROJECT}_'\"\$img\":\"\$PREV\" || true
    fi
  done
  # docker-compose 1.29 + new engine: avoid recreate ContainerConfig bug
  docker-compose -p '$PROJECT' --env-file '$ENV_FILE_REMOTE' stop || true
  docker-compose -p '$PROJECT' --env-file '$ENV_FILE_REMOTE' rm -f || true
  docker-compose -p '$PROJECT' --env-file '$ENV_FILE_REMOTE' up -d
  for img in api worker web; do
    docker tag '${PROJECT}_'\"\$img\":latest '${PROJECT}_'\"\$img\":'$TAG'
  done
  echo '$TAG' > releases/current
  echo '$TAG' >> releases/history
  echo tagged_$TAG
"

if ! wait_healthy; then
  echo "Deploy unhealthy — attempting automatic rollback to previous tag" >&2
  PREV="$(ssh "$HOST" "tail -n 2 $REMOTE_DIR/releases/history | head -n 1")"
  if [[ -n "$PREV" && "$PREV" != "$TAG" ]]; then
    ROLLBACK_TAG="$PREV" "$0" --rollback
  fi
  exit 1
fi

echo "Deployed $TAG. hotelradar.in nginx was NOT modified."
echo "Secrets: $ENV_FILE_REMOTE"
echo "Rollback: ROLLBACK_TAG=<prior> $0 --rollback"
