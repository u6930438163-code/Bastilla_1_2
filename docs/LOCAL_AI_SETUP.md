# Uruchamianie AI i Codex w BastillaOS

## Ollama

`npm run setup:ollama` instaluje lokalną usługę, pobiera wskazany model i próbuje go uruchomić w pamięci (`keep_alive=24h`). **Domyślnie zachowuje inne pobrane modele**; ich usunięcie wymaga jawnego `OLLAMA_PRUNE_OTHERS=true`. Naprawia brakujące `zstd` na Debianie/Ubuntu, jeśli proces ma uprawnienia administratora. Używa ustawionego `OLLAMA_MODEL` (domyślnie `dolphin-mixtral:8x7b`, model wymagający znacznych zasobów RAM/VRAM).

Instalacja może potrwać kilka minut. W zwykłym terminalu uruchom polecenie bezpośrednio. Z konsoli WWW z krótkim limitem czasu możesz uruchomić `root exec nohup npm run setup:ollama > /tmp/bastilla-ai-setup.log 2>&1 < /dev/null &`, a następnie odczytać log przez `root exec tail -n 15 /tmp/bastilla-ai-setup.log`.

Usługa nasłuchuje tylko lokalnie na 127.0.0.1:11434. Nie udostępniaj samej Ollamy publicznie. Po ponownym uruchomieniu środowiska, gdy binaria i model nadal istnieją, wystarczy `ollama serve` lub ponowne uruchomienie instalatora.

Po instalacji wyślij do każdego z agentów oddzielnie wiadomość zaczynającą się od `@model`. Ten prefiks omija deterministyczne odpowiedzi best-fit. Dopiero faktyczna odpowiedź modelu potwierdza działanie AI. Aria ma wewnętrzny identyfikator `si_1`.

## Codex CLI

1. `npm run setup:codex` — instaluje oficjalny pakiet @openai/codex w ignorowanym katalogu .bastilla-tools/codex, bez globalnej instalacji npm.
2. `npm run codex -- login status` — sprawdza logowanie.
3. `npm run codex -- login --device-auth` — uruchamia logowanie użytkownika; dokończ je osobiście. Nie przekazuj hasła ani tokenów na czacie.
4. `npm run codex -- exec --sandbox read-only "Przejrzyj projekt i opisz znalezione błędy"` — przykład przeglądu bez zapisu.

Kod i logowanie Codex nie są automatycznie udostępniane agentom przez GPT Actions. Logowanie Codex nie konfiguruje modelu Ollama ani publicznego API. W środowisku nietrwałym AI Studio instalacje i pobrane modele mogą zniknąć po odtworzeniu kontenera; skrypty pozwalają odtworzyć konfigurację.

Źródła: https://docs.ollama.com/linux ; https://ollama.com/library/qwen3:0.6b ; https://learn.chatgpt.com/docs/codex/cli ; https://learn.chatgpt.com/docs/auth
