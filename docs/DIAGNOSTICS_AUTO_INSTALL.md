# Automatyczna instalacja diagnostyki Bastilla_1_2 (Debian 13/Ubuntu)

Instalator korzysta z katalogu **50 projektów GitHub** w pliku
integrations/diagnostics/catalog.mjs. **Nie instaluje wszystkich 50**:
automatyzuje instalację 24 narzędzi z repozytoriów systemowych APT.
Pozostałe wymagają osobnych instalacji lub uruchomienia usług.

## Uruchomienie z katalogu repozytorium

Wymagane: Debian 13 lub Ubuntu, Node.js (projekt korzysta z Node 24), APT,
połączenie sieciowe i konto z prawami sudo do instalacji.

Plan bez żadnych zmian w systemie:

    git pull --ff-only origin main
    npm run setup:diagnostics

Instalacja podstawowego profilu (do 13 programów, jeśli dostępne w APT):

    npm run setup:diagnostics -- --apply

Instalacja profilu rozszerzonego (do 24 programów):

    npm run setup:diagnostics -- --apply --profile expanded

Instalacja wybranego programu:

    npm run setup:diagnostics -- --apply --tool Nmap

Instalacja pakietów przypisanych wybranemu agentowi (bez uruchamiania AI):

    npm run setup:diagnostics -- --apply --profile expanded --agent Aria
    npm run setup:diagnostics -- --apply --profile expanded --agent Alex
    npm run setup:diagnostics -- --apply --profile expanded --agent Astyria
    npm run setup:diagnostics -- --apply --profile expanded --agent Aurelius

Filtr --agent wybiera tylko narzędzia przydzielone wskazanemu agentowi.
Nie tworzy ani nie uruchamia jego workera i nie udziela mu uprawnień root.
Opcje --agent i --tool odrzucają wybór narzędzia należącego do innej roli.


Raport samego planu w formacie JSON:

    npm run setup:diagnostics -- --json --report data/diagnostics-plan.json

Po wykonaniu --apply raport zapisuje się do
data/diagnostics-install-report.json (tryb 0600; katalog data jest ignorowany
przez Git). Raport odróżnia obecność w PATH, zainstalowany pakiet,
gotowość do instalacji, brak pakietu oraz wymagane wdrożenie ręczne.
Opcja --no-update pomija odświeżenie indeksu APT w trybie instalacji.

## Dostępne profile

- Podstawowy: Glances, Sysstat, strace, Smartmontools, NVMe CLI,
  lm-sensors, MTR, tcpdump, Nmap, GoAccess, HTTPie, Lynis, lnav.
- Rozszerzony: podstawowy + bpftrace, FIO, iperf3, testssl.sh,
  AIDE, OpenSCAP, pg_activity, pgBadger, ssh-audit, MySQLTuner i ClamAV.

Jeśli pakiet nie jest dostępny w aktywnych repozytoriach APT, instalator
pomija go i podaje powód w raporcie. Nie dodaje zewnętrznych repozytoriów,
nie pobiera ani nie uruchamia skryptów instalacyjnych GitHub, nie uruchamia
skanów sieci ani testów obciążenia. **Przed instalacją każdego pakietu** uruchamia
symulację APT i pomija pakiet, jeśli symulacja się nie powiedzie albo wskazuje
usuwanie pakietów. Pakiety APT mogą wykonywać standardowe kroki postinstalacyjne,
**w tym uruchamiać usługi**, dlatego --apply uruchamiaj świadomie na własnym hoście.
Programy z profilu rozszerzonego mogą wymagać dodatkowej konfiguracji i zasobów.

## Integracja z Bastillą i agentami

Po instalacji odśwież panel:
**Operations Center → 50 narzędzi → Sprawdź dostępność**.
Panel pokazuje PATH procesu serwera — w kontenerze może to być inna
przestrzeń niż host. Przypisanie katalogowe Aria/Alex/Astyria/Aurelius
nie oznacza jeszcze uruchomienia ich modeli ani workerów.
Konfiguracja workerów: docs/DIAGNOSTICS_50_WORKERS.md.

Rozbudowane usługi (m.in. Wazuh, Grafana, Prometheus, Jaeger i Sentry)
oraz programy wymagające innych źródeł instalacji mają status manual;
potrzebują osobnego zabezpieczenia, portów, danych i konfiguracji.
Nie są automatycznie włączane bez decyzji operatora.

## Testy instalatora

    node --test tests/diagnostics-installer.test.mjs
    npm test

Testy nie instalują żadnych pakietów.

## Kontrola bezpieczeństwa i ograniczenia

- Instalator nie uruchamia skanów ani nie sprawdza zewnętrznych hostów.
- Wykonanie --apply aktualizuje indeks APT, jeśli ma zainstalować nowe pakiety.
- Weryfikacja apt-get --simulate blokuje operacje Remv/Purg i błędy zależności;
  to nie jest pełny audyt bezpieczeństwa skryptów postinstalacyjnych APT.
- Każde wykonanie --apply zapisuje raport z sukcesami i błędami w folderze data/.
- W Codespaces narzędzia instalują się w kontenerze, nie na hoście GitHub ani
  na komputerze użytkownika. Po odbudowaniu kontenera instalację może trzeba
  powtórzyć albo dodać do własnego obrazu kontenera.

Pakiety ssh-audit, mysqltuner i clamav są dostępne dla Debiana 13 Trixie:
https://packages.debian.org/trixie/ssh-audit
https://packages.debian.org/trixie/mysqltuner
https://packages.debian.org/trixie/clamav
