# Bastilla AI Work — interaktywny czat LIVE

Interfejs `src/components/LiveAgentChat.tsx` ma przełącznik **Tryb Work**,
przyciskowe skróty poleceń i renderowanie wiadomości przez
`src/components/WorkChatMessage.tsx`.

## Co obsługujemy

- Tradycyjne odpowiedzi Markdown (nagłówki, tabele, kod, matematyka, SVG,
  obrazy oraz wideo) poprzez istniejący `FormattedMessage`.
- Osadzone interaktywne karty JSON w blokach ```bastilla-ui```.
- Wykresy liniowe i słupkowe, metryki, tabele, obrazy HTTPS/lokalne, MP4,
  WebM i YouTube.
- Przycisk działania **wstawia propozycję do pola edycji**. Operator sam
  zatwierdza wysłanie; sam klik nie uruchamia polecenia ani skryptu.
- Historyczne wiadomości i streaming SSE pozostają w API `/api/live-chat`;
  dla widgetów nie dodano obejścia autoryzacji.

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
W celu sprawdzenia czatu w trybie LIVE muszą być skonfigurowane zmienne
uwierzytelnienia, aktywne API `/api/live-chat` oraz prawdziwe workery agentów
(patrz `docs/LIVE_CHAT_SETUP.md`).
