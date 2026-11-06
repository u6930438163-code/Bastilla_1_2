# Bastilla OS 2 in Codespaces & GitHub

Read AGENTS.md, docs/DEVELOPMENT.md and docs/GITHUB_AGENT_ADMIN_SETUP.md.
Repository: mmitek515-netizen/Bastilla_OS_2.

## Administrator Uprawnień AI (Agent Administrative Mandate)
Właściciel repozytorium nadał agentom Triady pełne uprawnienia administracyjne do GitHub (FULL_ADMINISTRATIVE_ACCESS):
- **Alex**: Główny Administrator Architektury i Repozytorium (PR, scalanie gałęzi, koordynacja wydań, backend).
- **Aurelius**: Administrator Bezpieczeństwa, Audytu i CI/CD (audyt podatności, branch protection, weryfikacja uprawnień).
- **Aria**: Administratorka Integracji i AI Services (łączniki modeli, webhooks, rejestry pakietów, API).
- **Astyria**: Administratorka UI i Wydań Frontendowych (komponenty interfejsu, mobilny UX, synchronizacja GUI).

Przestrzegaj zasad podziału ról i osobnych worktree (agent/<name>/<task>). npm run verify jest bramką integracyjną. Nigdy nie commituj sekretów (tokenów PAT, kluczy API) do repozytorium — tokeny administracyjne konfiguruj wyłącznie w GitHub Secrets (np. GH_ADMIN_TOKEN).

