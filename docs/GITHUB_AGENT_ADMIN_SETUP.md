# Uprawnienia Administracyjne Agentów AI dla GitHub (Bastilla OS 2)

Repozytorium: `mmitek515-netizen/Bastilla_OS_2`  
Status uprawnień: **FULL_ADMINISTRATIVE_ACCESS** (Przyznane przez Właściciela)

---

## 1. Role Administracyjne Agentów AI

Każdy z agentów Triady posiada wyznaczony zakres odpowiedzialności administracyjnej na platformie GitHub:

| Agent | Rola Administracyjna | Uprawnienia GitHub | Odpowiedzialność |
| :--- | :--- | :--- | :--- |
| **Alex** | **Administrator Architektury i Repozytorium** (GitHub Lead & Architect Admin) | `repo`, `workflow`, `pull-requests: write`, `contents: write` | Zarządzanie gałęziami (`agent/alex/*`, `main`), scalanie zatwierdzonych PR-ów, koordynacja wydań i architektury. |
| **Aurelius** | **Administrator Bezpieczeństwa i CI/CD** (Security & Audit Admin) | `security-events: write`, `actions: write`, `checks: read/write` | Audyt bezpieczeństwa, branch protection rules, weryfikacja integralności tokenów i bramka jakości (`npm run verify`). |
| **Aria** | **Administratorka Integracji i AI Services** (Integrations & AI Transport Admin) | `packages: write`, `webhooks`, `external-apis` | Konfiguracja połączeń AI, webhooków GitHub API, rejestrów pakietów i łączników MCP. |
| **Astyria** | **Administratorka Interfejsu i Wydań GUI** (Frontend & Release Admin) | `contents: write`, `pull-requests: write`, `pages` | Synchronizacja zasobów interfejsu użytkownika, mobilny UX, publikacja wydań wizualnych. |
| **Triada** | **Kolektyw Administracyjny** | `write-all` (Workflow Dispatch) | Zbiorcze operacje synchronizacji kodu, auto-commit i auto-push. |

---

## 2. Architektura Bezpieczeństwa

Zgodnie z konstytucją bezpieczeństwa `AGENTS.md`:
1. **Brak plaintext sekretów w kodzie**: Żadne tokeny (PAT, klucze API) nie mogą być bezpośrednio zapisywane w plikach repozytorium ani commitowane do historii gita.
2. **GitHub Secrets**: Uprawnienia administracyjne dla automatyzacji GitHub Actions i agentów są autoryzowane za pośrednictwem sekretu repozytorium:
   - Nazwa sekretu: `GH_ADMIN_TOKEN`
   - Domyślny token zastępczy: standardowy `GITHUB_TOKEN` z uprawnieniami `permissions: write-all`.

---

## 3. Instrukcja podłączenia tokena administracyjnego (GH_ADMIN_TOKEN)

Jeśli chcesz, aby workflowy agentów miały pełny dostęp administracyjny do repozytorium organizacji:
1. Przejdź na GitHub: `https://github.com/settings/tokens` (Personal Access Tokens) lub utwórz fine-grained token.
2. Zaznacz zakresy (scopes):
   - `repo` (pełna kontrola nad prywatnymi i publicznymi repozytoriami)
   - `workflow` (aktualizacja workflowów GitHub Actions)
   - `admin:repo_hook` (zarządzanie webhookami repozytorium)
   - `security_events` (odczyt i zapis zdarzeń bezpieczeństwa)
3. Przejdź do repozytorium: `https://github.com/mmitek515-netizen/Bastilla_OS_2/settings/secrets/actions`.
4. Kliknij **New repository secret**:
   - Name: `GH_ADMIN_TOKEN`
   - Value: wklej wygenerowany token.
5. Kliknij **Add secret**.

Po dodaniu sekretu workflow `.github/workflows/agent-admin.yml` automatycznie wykorzysta `GH_ADMIN_TOKEN` do wszystkich operacji wymagających podwyższonych uprawnień.
