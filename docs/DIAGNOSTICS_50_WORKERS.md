# Bastilla_1_2 — 50 narzędzi diagnostycznych i autonomiczne workery

## Co zostało wdrożone
- Katalog 50 różnych projektów GitHub: `GET /api/operations/diagnostics/tools` (wymaga uwierzytelnionej sesji operatora).
- Odczytowy snapshot hosta/kontenera: `GET /api/operations/diagnostics/snapshot` (bez uprawnień do wykonywania poleceń).
- Nowa zakładka „50 narzędzi” w Operations Center; filtr, link do repo i bezpieczne przygotowanie zadania dla wybranego agenta.
- Wykrywanie dostępności binarki w serwerowym PATH. **Nie pobiera, nie instaluje, nie uruchamia ani nie testuje żadnej z 50 aplikacji**. Narzędzia usługowe są oznaczone jako „Sprawdź ręcznie”.
- Autonomiczny, odczytowy monitoring wykonywany w ramach idle *prawdziwego workera*: Aria (pamięć/load), Alex (wolny dysk), Astyria (uprawnienia magazynu danych/użytkownik root), Aurelius (obecność interfejsów sieciowych poza loopback; brak aktywnego sondowania adresów).
- Wiadomości są wysyłane do istniejącego czatu wyłącznie po wykryciu zmiany w krytycznym alercie, bez zasypywania go raportami. Nie wykonują napraw.
- `packaging/live-chat/bastilla-agent@.service` dla 4 oddzielnych procesów systemd wraz ze skryptem instalacji.

## Faktyczny status autonomii
Kod transportu i kolejka nie oznaczają, że AI pracuje 24/7. Potrzebujesz działającego hosta, własnych adapterów AI, sekretów per agent, trwałego wolumenu i usług systemd. Każdy worker korzysta z istniejącego `runAgent(job, context)`; brak adaptera blokuje uruchomienie — bez zastępczego modelu i fikcyjnych odpowiedzi. Monitor jest lokalnym, deterministycznym checkiem, **nie autonomicznym rozumowaniem AI**. Heartbeat online dowodzi tylko żywego procesu, a nie gotowości modelu.

## Konfiguracja
Każda usługa `bastilla-agent@Aria`, `@Alex`, `@Astyria`, `@Aurelius` wymaga w odpowiadającym jej pliku `/etc/bastilla/live-chat/<agent>.env`:
```ini
BASTILLA_LIVE_CHAT_AGENT=Aria
BASTILLA_LIVE_CHAT_BASE_URL=https://twoja-prywatna-bastilla.example
BASTILLA_LIVE_CHAT_WORKER_TOKEN=UZUPELNIJ_LOSOWYM_SEKRETEM_32_PLUS
BASTILLA_AGENT_ADAPTER=integrations/live-chat/http-agent-adapter.mjs
BASTILLA_AGENT_ENDPOINT=https://prywatny-oryginalny-agent.example/api
BASTILLA_AGENT_API_KEY=UZUPELNIJ_ODREBNYM_SEKRETEM_32_PLUS
BASTILLA_DIAGNOSTICS_AUTOMONITOR=on
```
Tokeny workerów muszą odpowiadać wartościom serwerowej `BASTILLA_LIVE_CHAT_WORKER_TOKENS`. Oryginalny adapter HTTPS musi udostępniać obsługę `mode=task` i opcjonalnie `mode=idle`. Adresy powyżej są placeholderami, nie działającymi usługami. Plik `*.env` utwórz pod root z prawami `0640` i grupą `bastilla`; nigdy w repo.

Zainstaluj bez automatycznego startu:
```sh
sudo bash /opt/bastilla/scripts/install-live-chat-workers.sh
sudo systemctl enable --now bastilla-agent@Aria
sudo systemctl enable --now bastilla-agent@Alex
sudo systemctl enable --now bastilla-agent@Astyria
sudo systemctl enable --now bastilla-agent@Aurelius
systemctl status 'bastilla-agent@*.service'
```
Uruchom te polecenia dopiero po skonfigurowaniu prawdziwych adapterów i zweryfikowaniu praw hosta.

## Ograniczenia
- Automonitor jest domyślnie aktywny *tylko jeśli oryginalny worker faktycznie działa*; wyłącz: `BASTILLA_DIAGNOSTICS_AUTOMONITOR=off`. Nie wysyła wiadomości, gdy nie ma alertu. Częstotliwość sprawdzania krytycznych metryk: co najmniej 5 minut (jeżeli worker jest wolny).
- Brak automatycznego `apt install`, `pip install`, skanowania portów, testów obciążenia, restartów, root ani zmian systemu. Wszelkie naprawy wymagają świadomej akceptacji operatora.
- `PATH` dotyczy środowiska procesu serwera, nie hosta spoza kontenera. Wskazanie `W PATH` nie oznacza poprawnego skonfigurowania narzędzia.
- Powiadomienia w zamkniętej przeglądarce wymagają osobnego kanału Web Push/email; samo systemd tego nie zapewnia.
- W jednej instancji zapisy do pliku kolejki są serializowane; skalowanie serwera do kilku replik wymaga zewnętrznej transakcyjnej kolejki (np. Redis/BullMQ), by wykluczyć wyścigi.

## Testy
```sh
npm run lint
node --test tests/diagnostics-catalog.test.mjs
npm test
```


## Asynchroniczne przetwarzanie agentów
Każdy oryginalny worker może teraz obsłużyć wiele niezależnych zadań naraz przez asynchroniczne operacje I/O w Node.js. Konfiguracja per worker:

```ini
BASTILLA_AGENT_CONCURRENCY=2
```

- Domyślnie **2 zadania na agenta**, bezpieczny zakres **1–4**. Przy 4 workerach daje to do 8 równocześnie wykonywanych zadań, jeśli wszystkie prawdziwe adaptery obsługują współbieżność.
- Każde zadanie ma własny Promise, oddzielny cykl odnowienia lease i błąd/retry. Odpowiedzi mogą docierać poza kolejnością ich zlecenia.
- Gdy limity są zapełnione, worker nie pobiera dodatkowego zadania. Mechanizm `onIdle` uruchamia się tylko przy braku aktywnych zadań.
- `GET /api/live-chat/status` pokazuje odczyt z heartbeat: `agents.<nazwa>.concurrency`; Operations Center prezentuje obciążenie / sloty.
- `BASTILLA_AGENT_CONCURRENCY=1` przywraca tryb sekwencyjny, przydatny dla adapterów bez obsługi równoczesnych żądań.
- To współbieżność **zadań I/O**, nie cztery równoległe instancje modelu i nie wielowątkowe obliczenia CPU. Ograniczenia współbieżności samych endpointów AI pozostają po stronie oryginalnych dostawców.
- Wyłączenie workera anuluje sygnał do zadań w toku. Jeśli zadanie nie zakończy się poprawnie, serwer odzyska je po wygaśnięciu lease (semantyka at-least-once). Adapter powinien obsługiwać idempotencję, aby uniknąć ponownego wywołania nieodwracalnego działania.


## Asymetryczne workery — dodatkowo do asynchronicznych
Domyślny tryb `BASTILLA_WORKER_MODE=asymmetric` nadaje czterem oryginalnym agentom różne limity, rytm pobierania zadań i częstotliwość czynności podczas bezczynności:

| Agent | Specjalizacja | Równolegle | Poll | Idle |
|---|---|---:|---:|---:|
| Aria | Monitorowanie systemu | 2 | 2500 ms | 30000 ms |
| Alex | Diagnostyka/naprawy do akceptacji | 3 | 1000 ms | 45000 ms |
| Astyria | Bezpieczeństwo | 1 | 3500 ms | 60000 ms |
| Aurelius | Sieć i API | 2 | 2000 ms | 40000 ms |

Maksymalnie 8 jednoczesnych zadań I/O przy uruchomionych czterech workerach; to nie jest rezerwacja zasobów CPU ani gwarancja dostępności GPU/modelu. Zadania kierowane do danego agenta nadal są wykonywane **wyłącznie przez niego** — profil nie przekazuje tożsamości ani kluczy innym agentom.

W /etc/bastilla/live-chat/<Agent>.env (każdy worker własny plik):
```ini
BASTILLA_WORKER_MODE=asymmetric
# Zostaw poniższe pola puste, aby obowiązywały wartości profilu:
# BASTILLA_AGENT_CONCURRENCY=3
# BASTILLA_AGENT_POLL_INTERVAL_MS=1000
# BASTILLA_AGENT_IDLE_INTERVAL_MS=45000
```
Ustaw `BASTILLA_WORKER_MODE=uniform` aby powrócić do równych profili po 2 zadania; ręczne nadpisanie co najmniej jednego parametru pokazuje tryb `custom`. Ustawienie `BASTILLA_AGENT_CONCURRENCY=1` jest właściwe, jeśli dany endpoint agenta nie obsługuje współbieżnych wywołań. Wartości spoza dopuszczalnego zakresu zatrzymują start workera, zamiast uruchamiać go z niekontrolowanymi parametrami.

Panel Operacyjny pokazuje deklarowany tryb i limit **tylko podczas prawidłowo uwierzytelnionego heartbeat online**. Nie jest to dowód, że oryginalny model poprawnie odpowiada. Po wdrożeniu na serwerze zrestartuj usługi agentów, aby przyjęły nową konfigurację. Dane pracy `poll` i `idle` nie są wysyłane do UI ani przechowywane w kolejce.


## Wersja z bezpiecznym odzyskiwaniem zadań (lease fencing)
Każde zadanie ma numer podejścia `job.attempts` oraz losowy `workerId`. Zakończenie zadania, niepowodzenie i odnowienie lease są akceptowane wyłącznie wtedy, gdy zgadza się **agent, workerId, numer podejścia oraz nieprzeterminowany lease**. Starszy worker nie może ukończyć ani ponownie ustawić statusu zadania przejętego przez nowszy proces. Dzięki temu asynchroniczne wykonanie nie dopuszcza do „spóźnionych” wyników w kolejce.

**Aktualizacja serwera i klientów workerów musi być skoordynowana:** nowe żądania muszą zawierać `taskAttempt` przy `/worker/events` lub `attempt` przy `/worker/jobs/:id/heartbeat` i `/fail`. Starsze wersje klientów bez tego pola będą odrzucane (HTTP 400/409). Najpierw przygotuj nowe pliki/obrazy uruchomieniowe, a następnie zrestartuj serwer i 4 procesy agentów razem; przejściowe zadania przetworzone przez starszych klientów mogą ponowić się po wygaśnięciu lease.

Nadal obowiązuje semantyka **at-least-once**: jeśli oryginalny model wykonał operację zewnętrzną, ale odpowiedź nie dotarła, kolejka może zlecić ją ponownie. Działania zapisujące powinny korzystać z idempotency key = `job.id` lub wymagać zatwierdzenia przez operatora. Zabezpieczenie nie jest gwarancją „exactly once”.

## Liczniki odzyskiwania zadań w Operations Center
`GET /api/live-chat/status` ma teraz dwa dodatkowe liczniki łączne i per agent:
- `retrying`: zadania oczekujące w kolejce, które były już co najmniej raz podjęte (status `queued`, attempts > 0).
- `expiredLeases`: zadania nadal w statusie `running`, których okres własności upłynął; kolejny worker może je przejąć.

Panel pokazuje także istniejące liczniki `failed`. Są to dane z prawdziwej trwałej kolejki, **nie udawana aktywność agentów**. `expiredLeases > 0` nie musi oznaczać trwałej awarii: zadanie może czekać na najbliższe pobranie przez worker. Ponieważ odczyt `getStatus()` nie modyfikuje kolejki, samo otwarcie panelu nigdy nie naprawia ani nie przejmuje zadania.
