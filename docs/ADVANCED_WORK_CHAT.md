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

W głównym czacie wybierz **Więcej → Work → Dynamiczne LIVE**. Każda powiązana karta ma przyciski **Włącz LIVE / Wstrzymaj LIVE**, **Odśwież** oraz selektor **CPU / RAM**. Na żywo aktualizuje się też wykres (ostatnie 24 odczyty). Po zatrzymaniu karta **zamraża ostatnie pomiary z backendu**; jeśli nie wykonano jeszcze żadnego odczytu, pokazuje brak danych zamiast przykładowej wartości.

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

## Nowe karty statusu: Ollama, agenci i logi LIVE

W podglądzie **Work** dostępne są osobne zakładki **Ollama / Agenci LIVE** oraz **Logi LIVE**.

- `live_status` — read-only GET do jednego z dwóch ściśle ograniczonych endpointów: `/api/ollama/models` (Ollama, model skonfigurowany i dostępne modele) albo `/api/agents/background/status` (monitoring wspólnej Ollamy). Użytkownik może przełączać źródło, wstrzymać i wznowić aktualizacje, odświeżyć ręcznie i przygotować szkic diagnostyki. Interwał 5–30 s.
- **Istotne:** `/api/agents/background/status` nie sprawdza samodzielnej aktywności workerów. Odczyt „online” oznacza tylko stan wspólnej Ollamy — **nie potwierdza wykonywania zadań przez Arię, Alexa, Astyrię ani Aureliusa**. Podobnie dostępność `/api/ollama/models` nie potwierdza modelu w RAM.
- `live_logs` — osobna karta filtrów, wyszukiwania oraz rozwijania szczegółów. Pobiera **GET /api/operations/logs?filter=all**, wyłącznie przy aktywnej sesji operatora. Logi nie są automatycznie pisane na czacie. Kategoria `success` jest deklaracją systemowego wpisu `healed`, a nie potwierdzoną naprawą.
- Przy logu błędu można wybrać agenta i przygotować **edytowalny szkic** diagnostyczny. Żadna wiadomość nie zostanie wysłana bez świadomej akcji użytkownika; kliknięcie nie uruchamia poleceń.
- Przy odpowiedzi `401`/`403`/`503` karta logów pokazuje konieczność zalogowania operatora; nie omija uwierzytelnienia, nie pobiera haseł i nie pokazuje fikcyjnych logów.
- Zapamiętane ostatnie pomiary pozostają widoczne po wstrzymaniu albo błędzie, ale są wyraźnie oznaczone jako nieaktualne.
- Frontend nie odświeża ukrytej karty w tle. Ciągłe śledzenie zdarzeń jest zależne od działającego serwera.

Przykład wiadomości od agenta:

```bastilla-ui
{
  "title": "Kokpit diagnostyczny",
  "blocks": [
    { "type": "live_status", "title": "Ollama i agenci",
      "live": { "source": "ollama_inventory", "intervalMs": 15000 } },
    { "type": "live_logs" }
  ]
}
```

Test adaptera: `node --test tests/liveStatusData.test.mjs`. Kompletna weryfikacja projektu: `npm run verify`. Uruchomionej instancji AI Studio nie można uznać za zweryfikowaną tylko na podstawie zmian w repozytorium.

## Kolejność wypowiedzi i streaming

- `/api/triad/message` z nagłówkiem `Accept: text/event-stream` obsługuje SSE.
- Agenci są generowani sekwencyjnie w kolejności `CHAT_AGENT_NAMES`.
- `agent_start`, `agent_delta`, `agent_done` opisują postęp; `complete` zawiera utrwalony transcript. `failure` sygnalizuje brak zapisu.
- Samodzielna Ollama (`providers: ['ollama']`) przesyła rzeczywiste fragmenty NDJSON z modelu na żywo. Pozostałe obecnie używane dostawcy mogą zwracać pełną odpowiedź po zakończeniu generowania danego agenta.
- Stary format JSON bez `Accept: text/event-stream` zachowano dla kompatybilności.

## Bezpieczeństwo

Elementy UI nie wykonują kodu. Przyciski, formularze i przekazanie zadania wstawiają szkic do pola czatu, który operator może sprawdzić i wysłać. Przy strumieniowaniu polecenia wygenerowane przez model nie są automatycznie wykonywane. Statusy i liczby z wiadomości nie są pomiarami serwera, jeśli backend ich nie potwierdził. Nie wolno wstawiać sekretów ani prywatnych tokenów do bloków cURL. 

Weryfikacja: `npm ci && npm run verify`; test: `tests/chatRealStreaming.test.mjs`.
