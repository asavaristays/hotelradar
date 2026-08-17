#!/usr/bin/env bash
# Ensure deploy (www-data) can talk to Docker after reboot.
# Prefer permanent fix: root runs `usermod -aG docker deploy`.
set -euo pipefail
if docker ps >/dev/null 2>&1; then
  exit 0
fi
sudo /bin/chown root:www-data /var/run/docker.sock
sudo /bin/chmod 660 /var/run/docker.sock
docker ps >/dev/null
echo "docker.sock restored for www-data"
