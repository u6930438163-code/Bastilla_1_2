# Bastilla Work Chat — dynamiczne komponenty, cURL i generowanie odpowiedzi

Główny czat `src/components/AgentCommsView.tsx` renderuje wiadomości przez `WorkChatMessage.tsx`. AI generują zwykły tekst Markdown i opcjonalnie deklaratywne bloki `bastilla-ui` w tej samej wiadomości. Nie ma osobnego okna Live AI.

## Komponenty

Oprócz Markdown, terminala, wykresów, obrazów, wideo i tabel, dostępne są:
- `alert` — komunikaty o błędach i sukcesach (tone, title, message, prompt);
- `timeline` — przebieg wieloetapowego zadania (steps: title, detail, status);
- `accordion` — rozwijane sekcje raportu (items: title, content);
- `tabs` — wewnętrzne zakładki (tabs: label, content);
- `checklist` — lista z checkboxami i opcją przygotowania polecenia;
- `form` — dynamiczny formularz z polami text / select / checkbox;
- `handoff` — przekazanie propozycji do wybranego agenta;
- `code` — blok kodu z kopiowaniem;
- `curl` / `http` — podgląd żądania, kopiowalny cURL i odpowiedź;
- `json` — formatowany JSON;
- `diff` — zmiany plików z odmiennym formatowaniem linii;
- `logs` — logi filtrowane po poziomie (success, error, warn, info).
- `progress` — pasek postępu. 

## Przykład do wysłania przez agenta

```bastilla-ui
{
  "title": "Diagnostyka integracji",
  "blocks": [
    {
      "type": "curl",
      "title": "Przykładowe żądanie stanu",
      "method": "GET",
      "url": "/api/system/metrics",
      "headers": { "Accept": "application/json" },
      "response": { "message": "Brak odczytu, przykład struktury." }
    },
    {
      "type": "alert",
      "tone": "warning",
      "title": "Dane wymagają weryfikacji",
      "message": "To przykład komponentu, nie stan rzeczywistego serwera."
    },
    {
      "type": "form",
      "title": "Nowe zadanie",
      "prompt": "Przygotuj plan:",
      "fields": [
        { "type": "select", "label": "Priorytet", "options": ["Normalny", "Pilny"] },
        { "type": "text", "label": "Opis", "placeholder": "Co sprawdzić?" }
      ]
    }
  ]
}
```

## Dynamiczne LIVE — opcja dla metryk, wykresów i pasków

W głównym czacie wybierz **Więcej → Work → Dynamiczne LIVE**. Każda powiązana karta ma przyciski **Włącz LIVE / Wstrzymaj LIVE**, **Odśwież** oraz selektor **CPU / RAM**. Na żywo aktualizuje się też wykres (ostatnie 24 odczyty). Po zatrzymaniu karta pokazuje wyłącznie statyczne wartości z wiadomości, a nie symuluje nowych danych.

W wiadomości agent może włączyć odczyt tylko dla wspieranych typów `metric`, `chart`, `progress`, `table`, przez jawne pole `live`:

```bastilla-ui
{
  "title": "Monitoring hosta",
  "blocks": [
    {
      "type": "chart",
      "title": "CPU · LIVE",
      "chart": "line",
      "labels": [],
      "values": [],
      "live": {
        "source": "system_metrics",
        "field": "cpuPercent",
        "intervalMs": 5000
      }
    },
    {
      "type": "progress",
      "title": "Użycie RAM",
      "value": 0,
      "live": {
        "source": "system_metrics",
        "field": "ramPercent",
        "intervalMs": 5000
      }
    }
  ]
}
```

- Jedynym dozwolonym źródłem w tej wersji jest **GET /api/system/metrics** (odczyt hosta Bastilla). Pole `field` to wyłącznie `cpuPercent` albo `ramPercent`; RAM jest liczony na podstawie `ramUsedBytes / ramTotalBytes`. Agent nie może przez blok ustawić dowolnego URL.
- Interwał jest ograniczony do 2–30 sekund; nieaktywna karta przeglądarki nie wykonuje cyklicznych odczytów. Przycisk **Odśwież** wymusza nowy odczyt.
- Stan `LIVE` oznacza udany odczyt serwera. Przy błędzie pojawia się komunikat offline; zachowane ostatnie pomiary są oznaczane jako **nieaktualne**. Brak danych nie jest zastępowany fikcyjnym postępem.
- Wszystkie elementy pozostają komponentami wyświetlania. Wygenerowane karty **nie uruchamiają komend**, nie wykonują żądań zapisu i nie zmieniają konfiguracji systemu.

## Kolejność wypowiedzi i streaming

- `/api/triad/message` z nagłówkiem `Accept: text/event-stream` obsługuje SSE.
- Agenci są generowani sekwencyjnie w kolejności `CHAT_AGENT_NAMES`.
- `agent_start`, `agent_delta`, `agent_done` opisują postęp; `complete` zawiera utrwalony transcript. `failure` sygnalizuje brak zapisu.
- Samodzielna Ollama (`providers: ['ollama']`) przesyła rzeczywiste fragmenty NDJSON z modelu na żywo. Pozostałe obecnie używane dostawcy mogą zwracać pełną odpowiedź po zakończeniu generowania danego agenta.
- Stary format JSON bez `Accept: text/event-stream` zachowano dla kompatybilności.

## Bezpieczeństwo

Elementy UI nie wykonują kodu. Przyciski, formularze i przekazanie zadania wstawiają szkic do pola czatu, który operator może sprawdzić i wysłać. Przy strumieniowaniu polecenia wygenerowane przez model nie są automatycznie wykonywane. Statusy i liczby z wiadomości nie są pomiarami serwera, jeśli backend ich nie potwierdził. Nie wolno wstawiać sekretów ani prywatnych tokenów do bloków cURL. 

Weryfikacja: `npm ci && npm run verify`; test: `tests/chatRealStreaming.test.mjs`.
