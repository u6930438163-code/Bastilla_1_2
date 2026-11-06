# Bastilla_1_2 — 50 narzędzi diagnostycznych i autonomiczne workery

## Co zostało wdrożone
- Katalog 50 różnych projektów GitHub: `GET /api/operations/diagnostics/tools` (wymaga uwierzytelnionej sesji operatora).
- Odczytowy snapshot hosta/kontenera: `GET /api/operations/diagnostics/snapshot` (bez uprawnień do wykonywania poleceń).
- Nowa zakładka „50 narzędzi” w Operations Center; filtr, link do repo i bezpieczne przygotowanie zadania dla wybranego agenta.
- Wykrywanie dostępności binarki w serwerowym PATH. **Nie pobiera, nie instaluje, nie uruchamia ani nie testuje żadnej z 50 aplikacji**. Narzędzia usługowe są oznaczone jako „Sprawdź ręcznie”.
- Autonomiczny, odczytowy monitoring wykonywany w ramach idle *prawdziwego workera*: Aria (pamięć/load), Alex (wolny dysk), Astyria (uprawnienia magazynu danych/użytkownik root), Aurelius (miejsce na przyszły bezpieczny test wybranego celu — bez sondowania sieci bez konfiguracji).
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
