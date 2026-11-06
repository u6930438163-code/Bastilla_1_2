#!/usr/bin/env bash
set -euo pipefail
api_base="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
api_base="${api_base%/}"
if [[ "$api_base" != 'http://127.0.0.1:11434' && "$api_base" != 'http://localhost:11434' ]]; then
  printf '%s\n' 'Ten instalator konfiguruje lokalną Ollamę na porcie 11434. Zdalny OLLAMA_BASE_URL wymaga konfiguracji na wskazanym hoście.' >&2
  exit 1
fi
if ! command -v ollama >/dev/null 2>&1; then
  if ! command -v zstd >/dev/null 2>&1; then
    if [[ "$(id -u)" == '0' ]] && command -v apt-get >/dev/null 2>&1; then
      apt-get update
      apt-get install -y zstd
    else
      printf '%s\n' 'Brakuje zstd. Zainstaluj pakiet zstd w systemie i ponów próbę.' >&2
      exit 1
    fi
  fi
  install_file="$(mktemp)"
  trap 'rm -f -- "$install_file"' EXIT
  curl --fail --silent --show-error --location --retry 2 --connect-timeout 15 https://ollama.com/install.sh --output "$install_file"
  sh "$install_file"
fi
if ! curl --fail --silent --max-time 3 "$api_base/api/version" >/dev/null; then
  nohup env \
    OLLAMA_HOST=127.0.0.1:11434 \
    OLLAMA_FLASH_ATTENTION=1 \
    OLLAMA_KV_CACHE_TYPE=q8_0 \
    OLLAMA_NUM_PARALLEL=1 \
    OLLAMA_MAX_LOADED_MODELS=1 \
    OLLAMA_KEEP_ALIVE=-1 \
    ollama serve >/tmp/bastilla-ollama.log 2>&1 </dev/null &
fi
ready=false
for attempt in {1..30}; do
  if curl --fail --silent --max-time 2 "$api_base/api/version" >/dev/null; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  printf '%s\n' 'Ollama nie uruchomiła się. Sprawdź /tmp/bastilla-ollama.log.' >&2
  exit 1
fi

model="${1:-${OLLAMA_MODEL:-dolphin-mixtral:8x7b}}"
if [[ "$model" == 'auto' || -z "$model" ]]; then model='dolphin-mixtral:8x7b'; fi

printf 'Pobieranie modelu docelowego: %s\n' "$model"
OLLAMA_HOST=127.0.0.1:11434 ollama pull "$model"

# Usuń wszystkie pozostałe modele z lokalnej Ollamy, zostawiając wyłącznie $model
if command -v node >/dev/null 2>&1; then
  other_models="$(curl --fail --silent "$api_base/api/tags" | node -e '
    const target = (process.argv[1] || "").trim().toLowerCase();
    const norm = (s) => (s.includes(":") ? s : s + ":latest");
    let raw = "";
    process.stdin.on("data", (d) => (raw += d));
    process.stdin.on("end", () => {
      try {
        const data = JSON.parse(raw);
        for (const m of data.models || []) {
          const name = String(m.name || "").trim();
          if (name && norm(name.toLowerCase()) !== norm(target)) {
            console.log(name);
          }
        }
      } catch {}
    });
  ' "$model")"
  while IFS= read -r old_model; do
    [[ -z "$old_model" ]] && continue
    printf 'Usuwanie zbędnego modelu: %s\n' "$old_model"
    OLLAMA_HOST=127.0.0.1:11434 ollama rm "$old_model" || true
  done <<< "$other_models"
fi

# Zapisz skonfigurowany model w .env.local dla serwera BastillaOS
env_file="$(dirname "$0")/../.env.local"
if [[ -f "$env_file" ]]; then
  grep -v '^OLLAMA_MODEL=' "$env_file" > "${env_file}.tmp" || true
  printf 'OLLAMA_MODEL="%s"\n' "$model" >> "${env_file}.tmp"
  mv "${env_file}.tmp" "$env_file"
else
  printf 'OLLAMA_MODEL="%s"\n' "$model" > "$env_file"
fi

# Uruchom / rozgrzej model w pamięci RAM/VRAM (keep_alive 24h)
printf 'Uruchamianie modelu %s w pamięci Ollamy...\n' "$model"
curl --fail --silent --show-error --max-time 180 \
  -H 'Content-Type: application/json' \
  -d "{\"model\":\"$model\",\"messages\":[],\"stream\":false,\"keep_alive\":\"24h\"}" \
  "$api_base/api/chat" >/dev/null || true

printf 'Ollama gotowa i skonfigurowana. Aktywny wyłączny model: %s\n' "$model"
curl --fail --silent --show-error "$api_base/api/tags"
printf '\n%s\n' 'Lista modeli potwierdzona. Pozostałe modele zostały usunięte.'
