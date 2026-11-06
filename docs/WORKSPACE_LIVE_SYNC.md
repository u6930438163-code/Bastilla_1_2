# Bastilla_1_2 — synchronizacja LIVE czatu, terminala i DATA_STORE

## Co jest rzeczywiste

- Każda **udana operacja** przez istniejące API czatu, poleceń jądra, misji i aplikacji powoduje sygnał zmiany z serwera.
- Nowy prywatny strumień SSE: `GET /api/workspace/events`. Odpowiedź jest dostępna **tylko dla zalogowanego operatora czatu LIVE** i chroniona istniejącą podpisaną sesją. `GET /api/workspace/status` zwraca stan łączności.
- Sygnał niesie **tylko identyfikator, typ i czas**; nigdy treści czatu, wpisanego polecenia, stdout/stderr, pamięci, hasła ani tokenów.
- Interfejs reaguje natychmiast na sygnał, pobierając **autorytatywny stan jądra** przez `/api/kernel/state?fresh=1` (omija cache 2,5 s).
- Pozostaje istniejące odświeżanie co 4 sekundy, na wypadek braku autoryzacji lub zerwania SSE, oraz powiadomienia między kartami tej samej przeglądarki przez `BroadcastChannel`.
- Czat Aria/Alex/Astyria/Aurelius nadal posiada swój własny prywatny strumień SSE (`/api/live-chat/events`) i trwały stan/wiadomości na serwerze.
- Terminal pokazuje aktywność, rzeczywiste odpowiedzi istniejących API i rozpoznaje podłączony strumień. Można filtrować log, kopiować lub pobierać **lokalny** dziennik sesji, zarządzać szybkimi skrótami, ukrywać panel aktywności i używać historii poleceń strzałkami.

## Ograniczenia, ważne dla bezpieczeństwa

- Samo scalenie kodu na GitHub **nie uruchamia** backendu na telefonie ani w Codespaces. Potrzebny jest działający serwer Node + jądro Python i zalogowana sesja operatora, aby uzyskać prawdziwe SSE.
- Niezalogowani użytkownicy nadal mają fallback odświeżania co 4 s. UI pokazuje wtedy `ODŚWIEŻANIE 4s`, a nie fałszywe `LIVE`.
- **Wyniki poleceń powłoki i surowe wpisy terminala nie są udostępniane innym urządzeniom.** Pojawiają się wyłącznie w lokalnej sesji terminala; między urządzeniami synchronizuje się wynikowy DATA_STORE i informacja o zmianie.
- Nowa szyna powiadomień nie interpretuje poleceń z czatu i **nie uruchamia skryptów**. Uprawnienia wykonywania poleceń pochodzą wyłącznie z dotychczasowych endpointów. Nie należy publicznie wystawiać API Bastilla z obsługą poleceń systemowych. Uruchom je za prywatnym HTTPS/VPN, a narzędzia root/exec zabezpiecz uwierzytelnianiem operatora.
- BroadcastChannel działa między kartami tej samej przeglądarki i originu, nie jest samodzielnym kanałem między telefonami. Między urządzeniami używany jest SSE.
- Wielu jednoczesnych użytkowników/operacji wymaga dodatkowej kontroli wersji i rozwiązywania konfliktów zapisu; stan nadal należy do pojedynczego backendu Python. To nie jest rozproszony silnik CRDT ani synchronizacja kodu repozytorium GitHub.
- Zmiany lokalnych plików poza udokumentowanymi API (np. przez SSH) nie emitują sygnału SSE; główny stan jądra odświeża się awaryjnie co 4 s. Zmiany w kodzie GitHub wymagają `git pull` oraz restartu/rebuild aplikacji, jeśli to konieczne.

## Jak uruchomić i sprawdzić

```bash
npm ci
npm run verify
npm run dev
```

1. Skonfiguruj `BASTILLA_LIVE_CHAT_ALLOWED_ORIGIN`, `BASTILLA_LIVE_CHAT_USER_PASSWORD` i `BASTILLA_LIVE_CHAT_SESSION_SECRET` prywatnie na serwerze zgodnie z `docs/LIVE_CHAT_SETUP.md`.
2. Otwórz Bastilla, zaloguj się przez **Czat AI · LIVE**. W zakładce Terminal zobaczysz `SYNCHRONIZACJA LIVE` po zestawieniu SSE.
3. Otwórz tę samą instancję na drugim urządzeniu (zaloguj drugą kartę/urządzenie w tym samym originie) i wykonaj `set test_sync live` w pierwszym terminalu.
4. Druga karta powinna otrzymać sygnał `Terminal`, zaktualizować DATA_STORE i pokazać zmianę bez czekania na 4‑sekundowy timer. Możesz też wysłać wiadomość z głównego czatu lub zmienić DATA_STORE przez istniejące API.
5. Sprawdź też działanie po chwilowym zerwaniu SSE: status przejdzie w polling, a po powrocie połączenia do LIVE. Dodatkowy test API: `GET /api/workspace/events` bez podpisanej sesji powinien zwrócić **401** (albo 503, jeśli auth nie jest skonfigurowany).
6. Dla czterech agentów wykonaj osobny test rzeczywistych workerów zgodnie z `docs/LIVE_CHAT_SETUP.md` — sam heartbeat i CI nie potwierdzają generowania odpowiedzi.

Testy kontraktowe: `node --test tests/workspace-sync.test.mjs`.
