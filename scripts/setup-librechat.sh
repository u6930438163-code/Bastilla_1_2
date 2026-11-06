#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOME_DIR="${BASTILLA_LIBRECHAT_HOME:-${ROOT}/.bastilla-tools/librechat}"
SETTINGS="${ROOT}/integrations/librechat/.env.local"
OVERRIDE="${ROOT}/integrations/librechat/docker-compose.override.yml"
export BASTILLA_REPO_ROOT="$ROOT"
export BASTILLA_LIBRECHAT_YAML="${ROOT}/integrations/librechat/librechat.yaml"

for command in git docker; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2; exit 1
  fi
done
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required." >&2; exit 1
fi
if [[ ! -f "$SETTINGS" ]]; then
  echo "Configure your secrets in $SETTINGS (copy .env.local.example)." >&2
  exit 2
fi
if [[ ! -f "$HOME_DIR/docker-compose.yml" ]]; then
  mkdir -p "$(dirname "$HOME_DIR")"
  git clone --depth 1 https://github.com/LibreChat-AI/LibreChat.git "$HOME_DIR"
fi
if [[ ! -f "$HOME_DIR/.env" ]]; then
  cp "$HOME_DIR/.env.example" "$HOME_DIR/.env"
fi

if [[ $# -eq 0 ]]; then set -- up -d; fi

cd "$HOME_DIR"
# All secrets stay on the host. The LibreChat checkout remains out of Bastilla Git.
exec docker compose --project-directory "$HOME_DIR" \
  --env-file "$HOME_DIR/.env" --env-file "$SETTINGS" \
  -f "$HOME_DIR/docker-compose.yml" -f "$OVERRIDE" "$@"
