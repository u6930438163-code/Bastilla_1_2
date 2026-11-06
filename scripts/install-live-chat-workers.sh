#!/usr/bin/env bash
set -euo pipefail
# Installs unit template only; never invents agent credentials or starts unconfigured agents.
if [[ "${EUID}" -ne 0 ]]; then echo "Uruchom jako root (sudo)." >&2; exit 1; fi
if [[ ! -f /opt/bastilla/integrations/live-chat/worker-runner.mjs ]]; then
  echo "Sklonuj repo do /opt/bastilla przed instalacją usług." >&2; exit 1
fi
if ! id bastilla &>/dev/null; then
  useradd --system --home-dir /var/lib/bastilla --create-home --shell /usr/sbin/nologin bastilla
fi
install -D -m 0644 /opt/bastilla/packaging/live-chat/bastilla-agent@.service /etc/systemd/system/bastilla-agent@.service
mkdir -p /etc/bastilla/live-chat
chmod 0750 /etc/bastilla/live-chat
chown root:bastilla /etc/bastilla/live-chat
systemctl daemon-reload
echo "Zainstalowano wzorzec bastilla-agent@.service (jeszcze nie uruchomiono)."
echo "Dla Aria/Alex/Astyria/Aurelius utwórz /etc/bastilla/live-chat/NAZWA.env (root:bastilla, 0640)."
echo "Dopiero po podłączeniu prawdziwych agentów włącz: sudo systemctl enable --now bastilla-agent@Aria (analogicznie pozostałych)."
