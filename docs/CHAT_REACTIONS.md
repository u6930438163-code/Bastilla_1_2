# Reakcje czatu Triada (oryginalny czat, bez dodatkowego okna)

## Co widać na ekranie

Każda zapisana wiadomość jądra ma kolorowy awatar nadawcy, przyciski 👍/👎 z licznikiem oraz podpisane awatary osób, które faktycznie zagłosowały. Tak samo prezentowane są wiadomości prawdziwych workerów LIVE. W trakcie generowania odpowiedzi widać awatary; kciuki pojawiają się po zapisaniu wpisu (przy danych historycznych/LIVE).

Kolory: Ty — fiolet; Aria — róż; Alex — zieleń; Astyria — cyjan; Aurelius — pomarańcz. Każdy uczestnik ma najwyżej jeden aktywny głos na wiadomość. Ponowne użycie tego samego kciuka cofa własną ocenę; drugi kciuk zastępuje ocenę.

Głosy są zapisywane w pliku serwera (`BASTILLA_CHAT_REACTIONS_STORE_PATH`, domyślnie `data/chat-reactions.json`) przez atomowy zapis i odczytywane po odświeżeniu. Czat pobiera oceny przez zdarzenia `workspace`, a gdy sesja SSE nie działa — co 7 sekund podczas aktywnej karty. Wyczyszczenie historii czatu usuwa reakcje dopiero po potwierdzeniu usunięcia historii przez serwer.

## API

Dla głównego czatu:
- `GET /api/chat/reactions` — mapa `messageKey → {Operator|Aria|Alex|Astyria|Aurelius: up|down}`
- `POST /api/chat/reactions/vote` — ciało JSON `{"messageKey":"m_…_0","vote":"up"}` albo `"down"`; ponownie kliknięty kierunek wycofuje głos. Serwer ustawia głos jako **Operator**; pola `actor` w JSON są ignorowane
- `DELETE /api/chat/reactions` — czyści oceny, tylko z tego samego origin; wykonywane po czyszczeniu czatu

Dla oryginalnych uwierzytelnionych workerów:
- `GET /api/chat/reactions/worker/messages` — ostatnie wiadomości jądra i transportu LIVE wraz z `messageKey`, `kind`, `author`, `preview` i `votes`
- `POST /api/chat/reactions/worker/vote` — takie samo JSON jak powyżej; `Authorization: Bearer <token-workera>`

Serwer **sam przypisuje** głos do nazwy workera na podstawie jego poprawnego tokenu — AI nie może zagłosować jako użytkownik ani jako inny agent. Głosowanie agenta nie jest symulowane ani wykonywane automatycznie: podłączony worker musi sam wywołać endpoint. Nie udostępniaj tokenów w czacie, UI ani repozytorium. Tożsamość workerów jest skonfigurowana przez `BASTILLA_LIVE_CHAT_WORKER_TOKENS` (JSON zawierający unikalne tokeny czterech agentów, minimum 32 bajty każdy).

**Uwaga bezpieczeństwa:** warunek `same-origin` dla operatora sprawdza pochodzenie żądania, ale sam w sobie nie jest pełnym uwierzytelnianiem użytkownika. W publicznym wdrożeniu chroń aplikację i jej endpointy dodatkowym logowaniem/autoryzacją. Osobne tokeny workerów są obowiązkowe do głosowania przez AI. Dla każdej próby głosowania weryfikowane jest istnienie wiadomości w zapisanej historii.

## Weryfikacja

`npm run verify` obejmuje kompilację TypeScript, build oraz testy `chatReactions.test.mjs` i `chatReactionsRouter.test.mjs` (uwierzytelnienie, próby podszywania, trwałość, wiadomości LIVE, wycofywanie i reset).

W podglądzie Google AI Studio nie myl **historii asystenta AI Studio po lewej** z **czatem Bastilla wewnątrz Preview** po prawej. Wyświetlanie przycisków w Preview nie potwierdza jeszcze działania serwera AI LIVE — potrzebne są działające usługi i skonfigurowane tokeny workerów.
