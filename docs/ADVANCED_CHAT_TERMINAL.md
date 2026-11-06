# Bastilla — zaawansowany terminal w głównym czacie

## Gdzie są elementy

Zakładka Czat AI → przycisk Terminal otwiera kartę wewnątrz głównej rozmowy.
Zakładka Terminal → Konsola, Karta terminala, Wykresy i monitoring.
Przełącznik Work w głównym czacie zawiera przykładowe karty Terminal i Zaawansowane.
Osobne okno Czat AI LIVE nie jest potrzebne.

## Karta wykonywania poleceń

Karta zawiera status zadania, logi z filtrem błędów i zdarzeń, kopiowanie i eksport TXT,
pasek oczekiwania na serwer, możliwość zwijania i przycisk do pełnego terminala.
Realne wykonanie z głównego czatu używa istniejącego API /api/kernel/command,
wymaga dwustopniowego zatwierdzenia i jest ograniczone do poleceń odczytu:
status, report, agents, config, history, root status, infra status.
Pozostałe polecenia wykonuj w pełnym terminalu zgodnie z jego uprawnieniami.
Karta pochodząca z odpowiedzi agenta nigdy automatycznie nie wykonuje kodu.
Jej dane są oznaczone jako niezweryfikowane przez backend.

Panel Wykresy i monitoring pobiera realne dane z autoryzowanych:
GET /api/operations/processes, /api/operations/logs, /api/operations/ollama.
Jeżeli brak autoryzacji lub serwer nie odpowiada, panel wyświetla brak danych.

## Karty osadzane w wiadomościach AI

W odpowiedzi agenta użyj bloku z językiem bastilla-ui i obiektem JSON:

```bastilla-ui
{
  "title": "Terminal — przykładowy format",
  "blocks": [
    {"type": "terminal", "command": "status", "status": "success",
     "entries": [{"type": "input", "text": "$ status"},
                 {"type": "output", "text": "Rzeczywisty wynik zwrócony przez usługę."}]},
    {"type": "progress", "title": "Postęp", "value": 52},
    {"type": "steps", "title": "Etapy", "active": 1, "steps": ["Analiza", "Wykonanie", "Weryfikacja"]}
  ]
}
```

Obsługiwane wartości type: terminal, chart, metric, table, progress, steps, files,
model_config, diagram3d, pdf, image, video, text, actions.
files pokazuje zawartość przekazaną przez agenta, nie przeszukuje dysku.
model_config tworzy propozycję i JSON bez zapisywania ustawień serwera.
diagram3d jest geometrycznym przykładem, nie reprezentacją faktycznych procesów.
image, video i pdf wymagają istniejącej bezpiecznej ścieżki lub HTTPS.

## Testy

Standardowa weryfikacja: npm run verify. Test integracyjny API wymaga
uruchomionej instancji Bastilla i sesji operatora.