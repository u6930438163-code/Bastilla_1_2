# Misja: Dokończenie projektów we wszystkich repozytoriach GitHub

**Identyfikator dyrektywy:** `COMPLETE_ALL_GITHUB_REPOSITORIES_PROJECTS`  
**Zleceniodawca:** Właściciel Repozytorium (Tata / Operator)  
**Status misji:** `ACTIVE` (W trakcie realizacji przez Triadę)  
**Uprawnienia wykonawcze:** `FULL_ADMINISTRATIVE_ACCESS` (Wszystkie repozytoria)

---

## 1. Zakres repozytoriów i projektów

Misja obejmuje audyt, finalizację, stabilizację i wdrożenie projektów w następujących repozytoriach:

| Repozytorium / Projekt | Ścieżka / URL | Rola w systemie | Zadania do dokończenia |
| :--- | :--- | :--- | :--- |
| **Bastilla OS 2** (Główne) | `mmitek515-netizen/Bastilla_OS_2` | Główny system operacyjny i pulpit webowy | Pełny interfejs, wielomodelowy czat Triady, terminal, API, zarządzanie agentami, 100/100 testów, CI/CD Actions. |
| **AI Studio BastillaOS** | `u6930438163-code/AI_Studio_BastillaOS` | Źródła bazowe i synchronizacja z AI Studio | Ciągły eksport zmian, eliminacja konfliktów, stabilność integracji Google AI Studio. |
| **Aplikacje BastillaOS** | `mmitek515-netizen/aplikacje` (`apps/*`) | Rejestr aplikacji użytkowych i narzędzi | Wdrażanie artefaktów z `exports/` do `apps/`, automatyczna rejestracja w pulpicie. |
| **Nowy_system & Kernel** | `Nowy_system/` oraz `svl_kernel.py` | Jądro SVL Kernel i hiperwizor VM | Pętla samoleczenia, optymalizacja pamięci RAM (<70% Idle), telemetria i snapshoty. |
| **BastillaOS v1 Compat** | `bastillaos/` | Kompatybilność wsteczna v1 | Zachowanie zgodności API, ścieżek i pakietów Debian bez regresji. |

---

## 2. Podział ról i mandaty wykonawcze agentów AI

### Alex — Główny Administrator Architektury i Repozytorium
- **Mandat**: Zabezpieczenie kontraktów backendowych, scalenie otwartych gałęzi (`agent/alex/*`), stabilizacja endpointów `/api/*`.
- **Działania**:
  1. Weryfikacja spójności API pomiędzy wszystkimi repozytoriami.
  2. Koordynacja wydań i utrzymanie integralności `origin/main`.
  3. Eliminacja competing edits — zasada jednego autora na plik.

### Aurelius — Administrator Bezpieczeństwa, Audytu i CI/CD
- **Mandat**: Audyt bezpieczeństwa każdego repozytorium, bramka jakości, ochrona gałęzi i weryfikacja sekretów.
- **Działania**:
  1. Nadzór nad 100% zaliczeniem testów jednostkowych (`npm run test`).
  2. Egzekwowanie branch protection oraz weryfikacja braku sekretów (zero plaintext PAT w commitach).
  3. Audyt integralności `DATA_STORE` i rejestru wdrożeń `.svl_deployments.json`.

### Aria — Administratorka Integracji i AI Services
- **Mandat**: Integracja łączników AI, protokołu MCP, webhooków GitHub i rejestrów pakietów.
- **Działania**:
  1. Obsługa łańcucha modeli (Google Gemini → xAI Grok → lokalny Ollama) z graceful degradation.
  2. Stabilizacja serwera MCP (`/api/mcp`) dla ChatGPT i zewnętrznych agentów.
  3. Konfiguracja automatycznych powiadomień o stanie repozytoriów.

### Astyria — Administratorka Interfejsu i Wydań GUI
- **Mandat**: Dopracowanie warstwy wizualnej, pełna wygoda na telefonie, eliminacja błędów i auto-push.
- **Działania**:
  1. Pełnoekranowy responsywny czat Triady z obsługą załączników i Real Vision.
  2. Pulpit nawigacyjny z podglądem stanu repozytoriów i postępu misji.
  3. Automatyczna synchronizacja i commitowanie prac po każdej zmianie.

---

## 3. Bramki weryfikacji i odbioru

Każde repozytorium uznaje się za dokończone, gdy:
1. `npm run verify` przechodzi z wynikiem zielonym (Testy, Lint, Web Build, Server Build).
2. Endpoint `/api/triad/git/status` potwierdza brak niespójności gałęzi i pomyślną synchronizację z `origin/main`.
3. Uprawnienia administracyjne (`FULL_ADMINISTRATIVE_ACCESS`) są aktywne i zweryfikowane w workflowach GitHub Actions.
4. Raporty postępu są zapisywane w `DATA_STORE` oraz w dzienniku systemowym.
