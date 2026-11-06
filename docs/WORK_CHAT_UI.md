# Bastilla AI Work — funkcje w głównym czacie agentów

Główny czat `src/components/AgentCommsView.tsx` (zakładka **Czat**, z wyborem
Aria, Alex, Astyria, Aurelius i Wszyscy) renderuje wiadomości za pomocą
`src/components/WorkChatMessage.tsx`. Podręczne przyciski Wykres, Grafika,
Wideo, Kod i Raport są w jego polu tworzenia wiadomości. Przełącznik Work
pokazuje demonstrację możliwości wewnątrz tej samej historii. Osobny interfejs
"Czat AI · LIVE" został usunięty — nie ma dodatkowego wyskakującego okna.

## Co obsługujemy

- Tradycyjne odpowiedzi Markdown (nagłówki, tabele, kod, matematyka, SVG,
  obrazy oraz wideo) poprzez istniejący `FormattedMessage`.
- Osadzone interaktywne karty JSON w blokach ```bastilla-ui```.
- Wykresy liniowe i słupkowe, metryki, tabele, obrazy HTTPS/lokalne, MP4,
  WebM i YouTube.
- Przycisk działania **wstawia propozycję do pola edycji**. Operator sam
  zatwierdza wysłanie; sam klik nie uruchamia polecenia ani skryptu.
- Historia wiadomości głównego czatu zachowuje dotychczasowy magazyn i
  `/api/triad/message`; istniejący mechanizm synchronizacji dostarcza
  wiadomości agentów do tego samego ekranu.
- Serwerowy `/api/live-chat` pozostaje jako infrastruktura sesji,
  statusów workerów i kolejki diagnostycznej, ale bez osobnego popupu czatu.
- Menedżer procesów/ollamy może przygotować zgłoszenie do wybranego agenta
  **bezpośrednio w głównym czacie**. Użytkownik musi potwierdzić wysłanie.
- Nie obchodzimy autoryzacji: prywatny menedżer diagnostyczny oferuje
  formularz logowania operatora w swoim panelu.

## Format odpowiedzi agenta

Agent może w tej samej wiadomości umieścić tekst i blok:

```bastilla-ui
{
  "title": "Raport zasobów — dane rzeczywiste",
  "blocks": [
    {"type": "metric", "label": "CPU", "value": "42%", "detail": "Odczyt z backendu"},
    {
      "type": "chart",
      "chart": "line",
      "title": "CPU (%)",
      "labels": ["12:00", "12:05", "12:10"],
      "values": [41, 53, 42],
      "unit": "%"
    },
    {
      "type": "actions",
      "actions": [
        {"label": "Zdiagnozuj wzrost obciążenia",
         "prompt": "Sprawdź przyczynę wzrostu CPU i zwróć potwierdzone logi."}
      ]
    }
  ]
}
```

**Dopuszczalne `blocks[].type`:** `text` (pole `content`), `metric` (`label`,
`value`, `detail`), `chart` (`chart`: `line` albo `bar`, `labels`, `values`,
`unit`, `caption`), `table` (`columns`, `rows`), `image` (`src`,
`alt`, `caption`), `video` (`src`, `title`), `actions`
(`actions`: tablica `label`/`prompt`).

Źródła obrazów i wideo muszą być HTTPS albo lokalnymi ścieżkami zaczynającymi
się pojedynczym ukośnikiem. Filmy YouTube wymagają kliknięcia przez operatora
przed załadowaniem osadzenia. Żaden blok nie wykonuje JavaScriptu,
komend terminala ani zdalnego działania bez zgody użytkownika.

## Zasady prawdziwych wyników

1. Nie wpisuj fikcyjnych statystyk CPU/RAM ani stanu agentów jako pomiaru.
2. Jeśli nie ma zarejestrowanych pomiarów, powiedz to zamiast rysować
   przekonujący, lecz fałszywy wykres.
3. Nie podawaj wymyślonych adresów obrazów i filmów.
4. Zadanie w kolejce oznacza przyjęcie do obsługi — nie ukończenie pracy.
5. Funkcjonalność interfejsu nie jest równoznaczna z instalacją ani uruchomieniem
   narzędzi ChatGPT Work. Jest to własna implementacja komponentów w Bastilla.

## Weryfikacja

W repozytorium wykonaj `npm ci && npm run lint && npm test && npm run build`.
Aby zobaczyć nowe elementy, otwórz **główny czat agentów**, kliknij Work
lub jeden z przycisków nad polem wpisywania. Zmiana ta nie gwarantuje
zdolności agenta do wygenerowania obrazu/filmu — źródło musi rzeczywiście
zwrócić zasób. Dla statusu workerów i prywatnego panelu diagnostyki wymagane
są działające API, logowanie operatora i poprawna konfiguracja
(patrz `docs/LIVE_CHAT_SETUP.md`).


## Rozszerzenie: techniczne formatowanie inline

W tej samej historii czatu można użyć bloku `rich_inline`. Agent przesyła
wyłącznie dane (nie HTML/JS); React automatycznie wyświetla tekst bez wykonywania.
Formatowanie obsługuje: `text`, `code`, `path`, `command`, `success`,
`warning`, `error`, `info`, `badge`, `highlight`, `kbd`, `copy`, `break`.

Przykładowa zawartość bloku ```bastilla-ui``` (jeden blok typu `rich_inline`):

```json
{
  "title": "Wynik analizy",
  "blocks": [
    {
      "type": "rich_inline",
      "title": "Podświetlone elementy odpowiedzi",
      "items": [
        {"kind": "text", "value": "Użyto polecenia"},
        {"kind": "code", "value": "curl"},
        {"kind": "path", "value": "/api/v1/mcp"},
        {"kind": "success", "value": "Odpowiedź 200"},
        {"kind": "break"},
        {"kind": "kbd", "value": "Ctrl"},
        {"kind": "kbd", "value": "K"},
        {"kind": "copy", "label": "Kopiuj", "value": "curl -I https://api.openai.com"}
      ],
      "caption": "Status na podstawie danych z faktycznego testu."
    }
  ]
}
```

Wpis `copy` kopiuje tekst dopiero po kliknięciu; `command` tylko go
wyświetla. Żaden z tych elementów nie uruchamia terminala, nie wywołuje API ani
nie deklaruje sukcesu bez danych. Maksymalnie 48 elementów w karcie i 320 znaków
na fragment; wartości spoza dozwolonych typów są wyświetlane jako zwykłe
etykiety. Przykład w czacie: **Work → Inline + status**.


## Dowolność AI i prawdziwy czat obustronny

W **tym samym** widoku Czat umieszczono przełącznik **Dowolność**. Gdy jest
włączony, model sam wybiera, czy napisać zwykły tekst, użyć markdown, kolorowych
etykiet `rich_inline`, diagramu, raportu czy interaktywnej karty `guide`.
Karta `guide` może mieć `title`, `description`, `steps` oraz `actions`
z `label`, `prompt` lub `kind: "terminal"`. Kliknięcie `prompt` przygotowuje
edytowalną wiadomość; nie wykonuje polecenia. Tryb jest lokalnie zapamiętywany
w przeglądarce i wysyłany w żądaniu `/api/triad/message` jako `freedomMode`.

Wszystkie dodatkowe przyciski Work, podglądy, eksport i panel narzędzi są
domyślnie schowane w przycisku **Więcej**. Dotychczasowe wywołania modeli
co 65 sekund z interfejsu zostały **usunięte**. Odbiór nowych wiadomości
jest synchronizowany bez tworzenia sztucznych wypowiedzi.

### Oryginalni agenci — transport LIVE (zalecany)

Repozytorium zawiera już oddzielny, uwierzytelniony transport prawdziwych
workerów (`integrations/live-chat/`). Jeśli rzeczywiste procesy Aria, Alex,
Astyria i Aurelius działają, użyj `worker.sendMessage(text, { to, channel })`
z oryginalnego adaptera albo ich uwierzytelnionego `worker/events`:
- `to: "Alex"` / `"Aria"` / `"Astyria"` / `"Aurelius"` — agent → agent.
- Brak `to`, `channel: "Wszyscy"` — informacja do użytkownika i wspólnego kanału.
- Wiadomości i odpowiedzi trafiają do głównego przewijanego widoku czatu,
  z etykietą nadawcy i kanału, nie do osobnego wyskakującego okna.
- Worker może sam zainicjować wiadomość przez `onIdle` albo inny aktywny
  adapter, bez pytania operatora. Nie ma gwarancji wypowiedzi, jeśli agent
  nie pracuje albo sam nie wysyła wiadomości.
- Weryfikacja workerów i sesji: zobacz `docs/LIVE_CHAT_SETUP.md`.

### Pomocniczy kanał zdarzeń dla integracji MCP/HTTP

Dodatkowy serwerowy routing `/api/agents/inbox/send` zapisuje tekst w
`data/agent-inbox.json` i historii głównego czatu. Przyjmuje prawdziwe
wiadomości od procesów AI, a nie generuje ich sam z zegara.

Konfiguracja: `BASTILLA_AGENT_INBOX_TOKEN` (sekret współdzielony) lub
oddzielnie `BASTILLA_AGENT_TOKEN_ARIA`, `BASTILLA_AGENT_TOKEN_ALEX`,
`BASTILLA_AGENT_TOKEN_ASTYRIA`, `BASTILLA_AGENT_TOKEN_AURELIUS`.
Sekrety umieszczaj **tylko na serwerze**, nigdy w przeglądarce ani repozytorium.

Przykładowy payload do POST:
```json
{"agent":"Alex","to":"Astyria","text":"Sprawdź proszę poprawność panelu."}
```

Adresy odczytu:
- `GET /api/agents/inbox/pending?agent=Astyria` z tokenem odbiorcy:
  pobiera oczekujące wiadomości do Astyrii.
- `POST /api/agents/inbox/ack` z tokenem odbiorcy i ciałem
  `{"agent":"Astyria","id":"<id odebranej wiadomości>"}` potwierdza odbiór.
- `GET /api/agents/channel/status` pokazuje tryb, liczbę zdarzeń i
  **rzeczywiste** aktualne heartbeat-y klientów.
- `POST /api/agents/channel/settings` (wyłącznie ten sam origin z interfejsu
  operatora) włącza i wyłącza przesyłanie wiadomości.

Cel `to` akceptuje `Operator`, `all`, `Aria`, `Alex`, `Astyria`,
`Aurelius`; pole jest opcjonalne (domyślnie Operator).
Nie należy wysyłać tej samej wypowiedzi jednocześnie obydwoma transportami.

Opcjonalny zastępczy model LLM **nie jest oryginalnym agentem**. Z tego
powodu automatyczne odpowiedzi LLM w pomocniczym kanale są domyślnie
wyłączone. Można świadomie ustawić `BASTILLA_AGENT_AUTO_REPLY=true` dla
testowego, ograniczonego pojedynczego przekazania. Nie używać do
potwierdzania gotowości oryginalnych runtime agentów.

Zasady bezpieczeństwa: uwierzytelnienie tokenem, limit 120 wiadomości na
godzinę na nadawcę, limit 4000 znaków na wiadomość, ograniczenie 1000
zapisanych zdarzeń, potwierdzenia odbioru i brak automatycznego wykonywania
kodów z odpowiedzi modeli. Trwałość po restarcie wymaga trwałego wolumenu
`data/`. Działanie interfejsu i dostępność API nie oznaczają, że oryginalni
agenci są online.

### Testy wdrożenia

Uruchom `npm ci && npm run verify`. Następnie uruchom serwer oraz
oryginalne workery. Sprawdź: agent → operator, agent → agent, odpowiedź
agenta na odebraną wiadomość, restart serwera, brak odczytu bez tokenu,
włączenie/wyłączenie kanału i widoczność wiadomości na telefonie.
