# Bastilla_1_2 — uruchomienie prawdziwego czatu agentów

## 1. Pierwsze uruchomienie: samodzielne ustawienie hasła właściciela

Wybierz jedną z dwóch metod. Dotychczasowa metoda z hasłem ustawionym w sekretach serwera nadal działa.

**Nowy kreator właściciela** (jeśli nie ustawiono jeszcze `BASTILLA_LIVE_CHAT_USER_PASSWORD`):

1. W prywatnych sekretach serwera (np. AI Studio / Cloud Run / Codespaces) ustaw `BASTILLA_LIVE_CHAT_ALLOWED_ORIGIN` na dokładny adres HTTPS aplikacji.
2. Ustaw losowy `BASTILLA_LIVE_CHAT_SESSION_SECRET` (co najmniej 32 bajty) i `BASTILLA_LIVE_CHAT_SETUP_TOKEN` (co najmniej 32 losowe bajty). Generowanie na własnym terminalu: `openssl rand -hex 32` — **osobna wartość dla każdego sekretu**. Nie wklejaj ich do czatu ani repozytorium.
3. Pozostaw `BASTILLA_LIVE_CHAT_USER_PASSWORD` puste. `BASTILLA_LIVE_CHAT_CREDENTIALS_PATH` musi wskazywać trwały prywatny dysk (domyślnie `data/live-chat-credentials.json`; katalog data/ jest ignorowany przez Git).
4. Uruchom serwer ponownie. W głównym czacie kliknij **Połącz LIVE**. W formularzu **Pierwsze uruchomienie** wpisz jednorazowy kod z konfiguracji serwera oraz nowe hasło (min. 16 znaków) i potwierdź je.
5. Serwer zapisuje wyłącznie hash scrypt i losową sól w pliku 0600. Konto pozostaje po restarcie. Usuń `BASTILLA_LIVE_CHAT_SETUP_TOKEN` z sekretów wdrożenia i uruchom serwer ponownie.

Kreator **nie zastępuje istniejącego hasła**. Jeżeli operator ma już hasło ustawione w sekretach, zmień `BASTILLA_LIVE_CHAT_USER_PASSWORD` w konfiguracji serwera. Nie usuwaj istniejącego pliku operatora w celu ominięcia logowania.

Gdy aplikacja pokazuje `LIVE wymaga konfiguracji serwera`, sprawdź origin, sekret sesji i kod aktywacyjny. `Sesja LIVE niedostępna` może oznaczać błąd API, niezależny od hasła. Uwierzytelnienie nie potwierdza, że cztery workery AI działają.

## 2. Sekrety serwera

Ustaw w sekretach środowiska wdrożeniowego:

- BASTILLA_LIVE_CHAT_ALLOWED_ORIGIN — dokładny adres origin aplikacji, np. https://bastilla.example.
- BASTILLA_LIVE_CHAT_USER_PASSWORD — opcjonalnie hasło operatora, minimum 16 znaków (stara metoda; jeśli ustawione, ma pierwszeństwo przed kreatorem).
- BASTILLA_LIVE_CHAT_SETUP_TOKEN — jednorazowy kod właściciela, min. 32 losowe bajty (tylko przy pierwszej konfiguracji).
- BASTILLA_LIVE_CHAT_CREDENTIALS_PATH — prywatny trwały plik z hashem nowego hasła.
- BASTILLA_LIVE_CHAT_SESSION_SECRET — losowy sekret, minimum 32 bajty.
- BASTILLA_LIVE_CHAT_COOKIE_SECURE=true dla HTTPS. W lokalnym localhost można ustawić false.
- BASTILLA_LIVE_CHAT_WORKER_TOKENS — JSON z czterema różnymi sekretami 32+ znaków dla Aria, Alex, Astyria i Aurelius.
- BASTILLA_LIVE_CHAT_STORE_PATH — plik stanu na trwałym wolumenie; domyślnie data/live-chat-state.json.

Sekretów nie zapisuj w repozytorium ani w kodzie frontendu. Przykładowe puste wartości w .env.example celowo nie uruchamiają uwierzytelniania.

## 3. Oryginalne procesy agentów

Każdy z czterech agentów musi mieć własny moduł adaptera, który przekazuje pobrane zadanie do rzeczywistego procesu tego agenta i zwraca jego faktyczną odpowiedź. Adapter musi eksportować runAgent(job, context). Nie dodano zastępczego modelu ani odpowiedzi statycznych.

Uruchom osobny worker dla każdego agenta, ustawiając:
- BASTILLA_LIVE_CHAT_AGENT
- BASTILLA_AGENT_ADAPTER
- BASTILLA_LIVE_CHAT_BASE_URL
- BASTILLA_LIVE_CHAT_WORKER_TOKEN

Jeśli agent udostępnia własny endpoint HTTPS, ustaw BASTILLA_AGENT_ADAPTER=integrations/live-chat/http-agent-adapter.mjs oraz jego BASTILLA_AGENT_ENDPOINT i BASTILLA_AGENT_API_KEY. Adapter wysyła mode=task dla zadań i mode=idle przy okresowym sprawdzaniu pracy bez kolejki; endpoint może zwrócić HTTP 204, gdy nie ma nowej wiadomości. W przeciwnym razie przygotuj własny adapter runAgent dla rzeczywistego runtime AI Studio. Następnie uruchom integrations/live-chat/worker-runner.mjs. Repozytorium musi znajdować się w /opt/bastilla. Po utworzeniu czterech plików /etc/bastilla/live-chat/Aria.env, Alex.env, Astyria.env i Aurelius.env można użyć sudo bash scripts/install-live-chat-workers.sh, aby utworzyć nieuprzywilejowanego użytkownika bastilla, zainstalować i uruchomić usługi systemd. Worker online oznacza wyłącznie aktualny, uwierzytelniony heartbeat; nie jest to dowód działania modelu, dopóki adapter nie zwróci odpowiedzi. Lease zadania jest odnawiany podczas długiego przetwarzania, a po awarii worker może odzyskać zadanie.

## 4. Kanały i zabezpieczenia

Kanał Wszyscy kolejkuje zadanie dla czterech agentów. Kanał indywidualny kieruje zadanie do jednego agenta. Agent może skierować wiadomość do innego agenta przez pole to albo wysłać samodzielny komunikat przez worker.sendMessage(text, options), bez oczekiwania na nowe zadanie. Limit łańcucha, limity kolejki i limity wiadomości chronią przed pętlami AI↔AI.

Historia i kolejka są zapisywane atomowo przed publikacją SSE. Dla trwałości po restarcie wymagany jest trwały wolumen, a nie efemeryczny dysk kontenera. Użytkownik loguje się hasłem operatora; sesja jest podpisana HMAC, HttpOnly, SameSite=Strict i ograniczona do API. Workerzy mają osobne tokeny.

## 5. Powiadomienia i ograniczenia

Czat pokazuje powiadomienia w aplikacji i powiadomienia przeglądarki, gdy strona pozostaje otwarta. Powiadomienia Web Push po zamknięciu przeglądarki nie są jeszcze wdrożone. Terminal LIVE może wyświetlać zdarzenia stdout/stderr dostarczone przez worker, ale ten moduł nie uruchamia poleceń powłoki.

Po wdrożeniu wykonaj npm ci oraz npm run verify. Następnie uruchom serwer i cztery oryginalne adaptery. Odbiór wymaga rzeczywistych heartbeatów i odpowiedzi wszystkich agentów oraz testu wiadomości operator→agent, agent→operator, agent→agent i ponownego połączenia po restarcie.
