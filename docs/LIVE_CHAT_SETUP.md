# Bastilla_1_2 — uruchomienie prawdziwego czatu agentów

## 1. Sekrety serwera

Ustaw w sekretach środowiska wdrożeniowego:

- BASTILLA_LIVE_CHAT_ALLOWED_ORIGIN — dokładny adres origin aplikacji, np. https://bastilla.example.
- BASTILLA_LIVE_CHAT_USER_PASSWORD — hasło operatora, minimum 16 znaków.
- BASTILLA_LIVE_CHAT_SESSION_SECRET — losowy sekret, minimum 32 bajty.
- BASTILLA_LIVE_CHAT_COOKIE_SECURE=true dla HTTPS. W lokalnym localhost można ustawić false.
- BASTILLA_LIVE_CHAT_WORKER_TOKENS — JSON z czterema różnymi sekretami 32+ znaków dla Aria, Alex, Astyria i Aurelius.
- BASTILLA_LIVE_CHAT_STORE_PATH — plik stanu na trwałym wolumenie; domyślnie data/live-chat-state.json.

Sekretów nie zapisuj w repozytorium ani w kodzie frontendu. Przykładowe puste wartości w .env.example celowo nie uruchamiają uwierzytelniania.

## 2. Oryginalne procesy agentów

Każdy z czterech agentów musi mieć własny moduł adaptera, który przekazuje pobrane zadanie do rzeczywistego procesu tego agenta i zwraca jego faktyczną odpowiedź. Adapter musi eksportować runAgent(job, context). Nie dodano zastępczego modelu ani odpowiedzi statycznych.

Uruchom osobny worker dla każdego agenta, ustawiając:
- BASTILLA_LIVE_CHAT_AGENT
- BASTILLA_AGENT_ADAPTER
- BASTILLA_LIVE_CHAT_BASE_URL
- BASTILLA_LIVE_CHAT_WORKER_TOKEN

Następnie uruchom integrations/live-chat/worker-runner.mjs. Plik systemd integrations/live-chat/bastilla-live-chat-worker@.service pokazuje wzorzec uruchomienia w tle. Worker online oznacza wyłącznie aktualny, uwierzytelniony heartbeat; nie jest to dowód działania modelu, dopóki adapter nie zwróci odpowiedzi.

## 3. Kanały i zabezpieczenia

Kanał Wszyscy kolejkuje zadanie dla czterech agentów. Kanał indywidualny kieruje zadanie do jednego agenta. Agent może skierować wiadomość do innego agenta przez pole to. Limit łańcucha, limity kolejki i limity wiadomości chronią przed pętlami AI↔AI.

Historia i kolejka są zapisywane atomowo przed publikacją SSE. Dla trwałości po restarcie wymagany jest trwały wolumen, a nie efemeryczny dysk kontenera. Użytkownik loguje się hasłem operatora; sesja jest podpisana HMAC, HttpOnly, SameSite=Strict i ograniczona do API. Workerzy mają osobne tokeny.

## 4. Powiadomienia i ograniczenia

Czat pokazuje powiadomienia w aplikacji i powiadomienia przeglądarki, gdy strona pozostaje otwarta. Powiadomienia Web Push po zamknięciu przeglądarki nie są jeszcze wdrożone. Terminal LIVE może wyświetlać zdarzenia stdout/stderr dostarczone przez worker, ale ten moduł nie uruchamia poleceń powłoki.

Po wdrożeniu wykonaj npm ci oraz npm run verify. Następnie uruchom serwer i cztery oryginalne adaptery. Odbiór wymaga rzeczywistych heartbeatów i odpowiedzi wszystkich agentów oraz testu wiadomości operator→agent, agent→operator, agent→agent i ponownego połączenia po restarcie.
