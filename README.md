# Bastilla_1_2

**Repozytorium projektu:** [u6930438163-code/Bastilla_1_2](https://github.com/u6930438163-code/Bastilla_1_2).

Aplikacja webowa z interfejsem AI, modułami SVL, integracjami MCP oraz przygotowanym transportem czatu wieloagentowego. Kod zawiera elementy odziedziczone z wcześniejszego Bastilla OS 2; nie oznacza to, że repozytorium jest tym samym projektem.

## Uruchomienie lokalne

Wymagane Node.js 24 i npm:

```sh
npm ci
npm run verify
npm run dev
```

Aplikacja lokalna: `http://localhost:3000` (jeżeli konfiguracja serwera nie zmienia portu). Ustaw zmienne środowiskowe na podstawie `.env.example`; nigdy nie commituj kluczy API. Przed wystawieniem portu Codespaces publicznie zweryfikuj uwierzytelnianie.

## Weryfikacja

```sh
npm run lint
npm test
npm run build
python3 integrations/svl/svl_core.py
```

Te polecenia opisują sposób weryfikacji; ich obecność nie oznacza, że CI lub produkcyjne wdrożenie już je wykonały.

## Aria, Alex, Astyria i Aurelius

`integrations/live-chat` zawiera uwierzytelniony transport, kolejkę i klienta workerów. **Oryginalni agenci AI Studio wymagają własnych zweryfikowanych adapterów/endpointów, sekretów i uruchomionych procesów**. Profile Copilot w `.github/agents` nie są tymi oryginalnymi agentami.

- [Konfiguracja czatu i workerów](docs/LIVE_CHAT_SETUP.md)
- [Integracja oryginalnych agentów z GitHub](docs/ORIGINAL_AGENTS_GITHUB_INTEGRATION.md)
- [Misja oryginalnej Arii SI_1](docs/MISJA_ARIA_SI1_BASTILLA_1_2.md)
- [Raport przeglądu i aktualizacji](docs/RAPORT_AKTUALIZACJI_BASTILLA_1_2.md)

## Przygotowanie do udostępnienia

Przed publikacją zweryfikuj: prawa do kodu i zasobów, licencję, skan sekretów, testy, konfigurację produkcyjną, logowanie użytkownika i bezpieczeństwo API. Repozytorium pozostaje prywatne, dopóki właściciel nie zdecyduje inaczej.

## Dokumentacja historyczna

- [AGENTS.md](AGENTS.md)
- [Rozwój](docs/DEVELOPMENT.md)
- [Historyczna misja Bastilla OS 2](docs/MISSION_BASTILLA_OS_2.md)

Import historyczny: `u6930438163-code/AI_Studio_BastillaOS` @ `2203ac94b1dbbad0f9e2a470c00a4b24bc9900ed`. Wcześniejsze dokumenty mogą zawierać nieaktualne nazwy repozytoriów.
