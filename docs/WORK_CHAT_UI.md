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
