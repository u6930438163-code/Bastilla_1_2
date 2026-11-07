# OpenAI GPT-4o — oddzielny klucz właściciela

Integracja w `Bastilla_1_2` używa **osobnego klucza czatu** z konta OpenAI API wskazanego przez operatora. Konto API może być inne niż konto ChatGPT. Model domyślny: `gpt-4o` (w dokumentacji OpenAI oznaczony jako deprecated — dostępność zależy od uprawnień konta). API jest rozliczane oddzielnie.

## Bezpieczna konfiguracja

1. W sekcji **Secrets** hostingu / Codespaces / wdrożenia AI Studio ustaw `OPENAI_CHAT_API_KEY` jako **sekret serwera**. Nie wpisuj klucza do czatu, GitHub, `VITE_*`, dokumentacji ani plików śledzonych przez Git.
2. Ustaw `OPENAI_CHAT_MODEL=gpt-4o`; jeśli konto nie obsługuje tego modelu, ustaw model rzeczywiście dostępny w jego API. Nie zakładaj, że aktywny klucz oznacza uprawnienia do każdego modelu.
3. W konfiguracji serwera ustaw `LLM_PROVIDERS=openai,ollama` (albo `openai`, aby świadomie korzystać wyłącznie z OpenAI). Brak `OPENAI_CHAT_API_KEY` powoduje pominięcie dostawcy.
4. Uruchom ponownie backend Bastilla, aby odczytał sekret z otoczenia. Na głównym czacie wybierz **API**, a nie **Ollama**, i wyślij krótki test do Aureliusa.
5. Sprawdź w odpowiedzi/logach identyfikator dostawcy `openai` oraz nazwę modelu. Nie drukuj tokenu, `.env.local` ani nagłówka Authorization. Błędy 401/403 oznaczają problem uwierzytelnienia/uprawnień; 404 może oznaczać niedostępność modelu; 429 oznacza limit; odpowiedź 200 z prawidłową treścią potwierdza wywołanie modelu.

**Ważne:** `OPENAI_API_KEY` dotychczas służy w tym repozytorium do **generowania obrazów**; czat używa **wyłącznie** `OPENAI_CHAT_API_KEY`. Hasło operatora LIVE, klucz GPT Actions i klucz LibreChat Bridge to różne sekrety i nie zastępują klucza OpenAI.

## Problemy z kluczami

Wcześniej `.env.local` mogło nadpisywać wstrzyknięty klucz z Codespaces / hostingu. Zmieniono priorytet: **sekrety procesu hosta > .env.local > .env**; niepuste wartości z `.env.local` nadal mogą zastąpić wartości z `.env`, ale nie nadpiszą sekretów udostępnionych przez hosting.

## Ollama

API OpenAI nie naprawia lokalnej usługi Ollama. `OLLAMA_BASE_URL=http://127.0.0.1:11434` oznacza usługę lokalną w **tym samym kontenerze/serwerze**, w którym działa backend. Jeżeli Ollama jest w innym kontenerze/hoście, skonfiguruj osiągalny adres po prywatnej sieci.

Nie używaj przycisku `sync-exclusive` ani skryptu `setup-ollama.sh` do diagnozy **bez sprawdzenia listy modeli** — obecnie mogą usuwać inne modele. Najpierw sprawdź tylko `/api/ollama/models` i zalogowane `/api/operations/ollama`.

## Gdzie znaleźć dowód wcześniejszego użycia przez Aureliusa

Logi procesów runtime Bastilla mogą być dostępne w **Menedżer zadań → Logi** lub przez operator-only `GET /api/operations/logs?filter=all` i rzeczywiste logi Codespace/hostingu. GitHub code search indeksuje głównie pliki repozytorium i nie potwierdza uruchomionych sesji agentów. Szukaj metadanych: `Aurelius`, `openai`, `gpt-4o`, kod odpowiedzi i czas żądania. W przypadku zrzutu logu usuń wszelkie sekrety, Authorization i dane prywatne.

## Testy

`node --test tests/openaiChatProvider.test.mjs`

`npm run verify`

Bez ustawienia sekretu na uruchomionym hoście nie można potwierdzić rzeczywistego wywołania OpenAI, nawet po przejściu testów jednostkowych.
