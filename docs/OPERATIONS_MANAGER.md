# Bastilla_1_2 — Menedżer zadań i Ollama AI

Moduły **Zadania i logi** oraz **Ollama** są widoczne w głównej nawigacji obok Czatu i Terminala. Dawny ekran `process_matrix` został przekierowany na nowy menedżer, ponieważ dotychczasowy kod zawierał przykładowe PID-y i symulowane pomiary CPU. Nowe moduły nie symulują procesów ani odpowiedzi modeli.

## 1. Dostęp i aktualizacje

1. Uruchom repozytorium (`npm ci && npm run dev`) i otwórz aplikację Bastilla w prywatnym środowisku.
2. Skonfiguruj bezpieczne poświadczenia operatora zgodnie z `docs/LIVE_CHAT_SETUP.md` i zaloguj się przyciskiem **Czat AI · LIVE**. Bez poprawnej sesji `/api/operations/*` zwróci 401 lub 503.
3. W nawigacji wybierz **Zadania i logi** (zakładki Procesy i Logi) lub **Ollama**. Stan odświeża się automatycznie co około 9 sekund oraz po zdarzeniach workspace LIVE. Ręczne odświeżenie jest dostępne w nagłówku.

## 2. Procesy i kolejki

- `GET /api/operations/processes` odczytuje rzeczywisty snapshot `ps`, bez przekazywania komend z przeglądarki do powłoki. Pola: PID, PPID, nazwa procesu, % CPU, pamięć RSS, stan, czas pracy.
- W środowisku kontenerowym procesy pochodzą z **przestrzeni procesów widocznej z kontenera**, niekoniecznie wszystkich procesów hosta. Gdy `ps` nie działa, panel pokazuje brak odczytu zamiast przykładowych danych.
- Podsumowanie kolejki z `/api/live-chat/status` pokazuje liczbę zadań oczekujących, uruchomionych i nieudanych oraz heartbeat Aria/Alex/Astyria/Aurelius. Heartbeat online nie dowodzi, że model faktycznie umie odpowiedzieć.
- Moduł jest tylko do odczytu. Nie ma fikcyjnych przycisków zabijania, wznawiania lub tworzenia procesów, ani automatycznego wykonywania poleceń z logów.

## 3. Logi — błędy i sukcesy

- `GET /api/operations/logs?filter=all|errors|success|info` korzysta z bieżących logów runtime serwera Bastilla. Widok wyświetla maksymalnie 100 pozycji z ostatnich 300.
- **Błędy i ostrzeżenia**: poziom `error` albo `warn`.
- **Zgłoszone sukcesy**: poziom `healed`. Oznacza deklarację aplikacji, a nie zweryfikowaną naprawę.
- **Informacje**: poziom `info`.
- API usuwa wybrane wzorce popularnych kluczy, haseł i tokenów z opisów. To mechanizm pomocniczy — nie wprowadzaj sekretów do komunikatów logowania. Zapis historii logów opiera się na bieżącej pamięci procesu serwera; restart usługi może ją wyczyścić.

## 4. Ollama — serwer, RAM, modele i fallback

- `GET /api/operations/ollama` sprawdza `/api/version`, `/api/tags` i `/api/ps` **prawdziwej skonfigurowanej** usługi Ollama.
- **ONLINE**: co najmniej jedno z API odpowiedziało. **Model w pamięci TAK**: model wykryty w `/api/ps`; **NIE**: odczyt /api/ps powiódł się, modelu nie znaleziono; **NIEZNANY**: brak wiarygodnej odpowiedzi /api/ps.
- Szacowana pamięć RAM modelu = `size - size_vram` według Ollama. **Nie jest to pełne zużycie RSS procesu ani pamięci całego hosta.**
- `OLLAMA_MODEL` określa model w konfiguracji. Łańcuch dostawców jest odczytywany z `LLM_PROVIDERS` i obejmuje OpenAI API oraz Ollama. Wskaźnik `without_nlp` odzwierciedla `CHAT_LOCAL_FALLBACK`.
- Ten ekran nie pobiera, nie usuwa i nie przełącza modeli bez zgody użytkownika.

## 5. Wyślij zgłoszenie wybranemu agentowi

1. W dolnym panelu wybierz z listy **Aria, Alex, Astyria lub Aurelius**.
2. W zakładce **Logi** kliknij przy błędzie **Wyślij błąd do [agent]**, a w zakładce **Ollama** — **Wyślij diagnostykę Ollamy do [agent]**.
3. Panel przesyła szczegółowe zgłoszenie do **autentycznej kolejki Bastilla LIVE**, przez `POST /api/live-chat/messages`. Serwer potwierdza przyjęcie zadania, nie wykonanie naprawy.
4. Kliknij **Czat LIVE**, by obserwować rzeczywiste odpowiedzi i wydarzenia workera. Agent może być offline, a zadanie oczekiwać w kolejce.
5. Zgłoszenie nakazuje wykonanie bezpiecznej diagnostyki, a przed restartem, usuwaniem danych, instalacją lub zmianą modeli wymaga uzyskania zgody. **Agent wykona naprawę tylko, jeśli jego oryginalny proces rzeczywiście działa oraz ma potrzebne narzędzia i uprawnienia.** Moduł nie nadaje tych uprawnień samodzielnie.

## Testy i bezpieczeństwo

```bash
npm run verify
node --test tests/operations-manager.test.mjs
```

API operations wymaga poprawnej sesji Bastilla LIVE, nie przyjmuje od klienta poleceń powłoki i nie udostępnia `cmdline` procesów ani zmiennych środowiskowych. Usługa powinna działać wyłącznie za prywatną siecią i HTTPS. Nie wystawiaj publicznie niezabezpieczonych starszych endpointów terminala, które mogą uruchamiać polecenia systemowe.
