#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "Run this installer with sudo/root." >&2
  exit 1
fi
if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemd is required to install background workers." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_DIR="/etc/bastilla/live-chat"
UNIT_SOURCE="$ROOT/integrations/live-chat/bastilla-live-chat-worker@.service"
UNIT_TARGET="/etc/systemd/system/bastilla-live-chat-worker@.service"

if [[ ! -f "$UNIT_SOURCE" ]]; then
  echo "Missing systemd unit template: $UNIT_SOURCE" >&2
  exit 1
fi

for agent in Aria Alex Astyria Aurelius; do
  env_file="$ENV_DIR/$agent.env"
  if [[ ! -f "$env_file" ]]; then
    echo "Missing worker environment file: $env_file" >&2
    exit 1
  fi
  if ! grep -q "^BASTILLA_LIVE_CHAT_AGENT=$agent$" "$env_file"; then
    echo "BASTILLA_LIVE_CHAT_AGENT must equal $agent in $env_file" >&2
    exit 1
  fi
  for key in BASTILLA_AGENT_ADAPTER BASTILLA_LIVE_CHAT_BASE_URL BASTILLA_LIVE_CHAT_WORKER_TOKEN; do
    if ! grep -q "^$key=" "$env_file"; then
      echo "Missing $key in $env_file" >&2
      exit 1
    fi
  done
done

install -D -m 0644 "$UNIT_SOURCE" "$UNIT_TARGET"
chmod 0600 "$ENV_DIR"/*.env
systemctl daemon-reload

for agent in Aria Alex Astyria Aurelius; do
  systemctl enable --now "bastilla-live-chat-worker@$agent.service"
done

for agent in Aria Alex Astyria Aurelius; do
  if ! systemctl is-active --quiet "bastilla-live-chat-worker@$agent.service"; then
    systemctl --no-pager --full status "bastilla-live-chat-worker@$agent.service" || true
    exit 1
  fi
  echo "$agent worker: active"
done
