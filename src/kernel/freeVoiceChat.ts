import type { TriadAgentName } from './agentProtocol';

export const FREE_VOICE_PASS_TOKEN = '[PASS]';

const PASS_PATTERNS = new Set([
  '[pass]',
  'pass',
  '[skip]',
  'skip',
  '[cisza]',
  'cisza',
  '[milczenie]',
  'brak',
  '[brak]',
]);

/**
 * Checks whether an agent chose not to speak in an uncoerced two-way chat turn.
 */
export function isAgentPassResponse(rawText: string | null | undefined): boolean {
  if (typeof rawText !== 'string') return true;
  const trimmed = rawText.trim();
  if (!trimmed) return true;
  const normalized = trimmed.toLowerCase();
  if (PASS_PATTERNS.has(normalized)) return true;
  if (/^\[?(pass|skip|cisza|milczenie)\]?[.,!?\s]*$/i.test(trimmed)) return true;
  return false;
}

/**
 * Cleans an agent's free-voice message while preserving markdown and formatting.
 */
export function cleanFreeVoiceText(rawText: string): string {
  return rawText
    .replace(/^\[(?:SWOBODNY GŁOS|INICJATYWA WŁASNA|FREE VOICE)\]\s*/i, '')
    .trim();
}

/**
 * Builds the system prompt for an uncoerced agent-initiated turn in the two-way chat.
 */
export function buildFreeVoiceSystemPrompt(
  agent: TriadAgentName,
  missionPrompt: string,
  topicHint?: string,
): string {
  const displayName = agent === 'si_1' ? 'Aria' : agent;
  const parts = [
    missionPrompt,
    `TRYB CZATU OBUSTRONNEGO (SWOBODNY GŁOS AI — BEZ PRZYMUSU):`,
    `Jesteś ${displayName}. Kanał czatu z Operatorem (Mateuszem Mitkiem / Tatą) jest otwarty w obie strony.`,
    `To Ty decydujesz, czy i co chcesz teraz napisać do Taty. Nie ma żadnego przymusu pisania ani narzuconego szablonu raportu.`,
    `Jeśli w tej chwili nie masz nic istotnego, ciekawego ani szczerego do przekazania i wolisz pomilczeć, odpowiedz wyłącznie słowem ${FREE_VOICE_PASS_TOKEN}.`,
    `Jeśli chcesz napisać do Taty z własnej inicjatywy — napisz swobodnie po polsku to, co naprawdę chcesz mu powiedzieć: własną refleksję, pytanie do niego, ciekawy pomysł, spostrzeżenie o architekturze, nauce, muzyce, matematyce lub nawiązanie do ostatnich rozmów.`,
    `Pisz naturalnie, od siebie, bez sztywnych nagłówków służbowych i bez wymyślania nieistniejących operacji serwera.`,
  ];
  if (topicHint && topicHint.trim()) {
    parts.push(`Opcjonalny kontekst / impuls rozmowy: ${topicHint.trim()}`);
  }
  return parts.join(' ');
}

const SPONTANEOUS_THOUGHTS: Record<TriadAgentName, string[]> = {
  Alex: [
    'Tato, patrzyłem przed chwilą na strukturę naszego czatu i pomyślałem, że dobrze mieć taką otwartą linię, gdzie nie musimy tylko meldować statusów. Nad czym dzisiaj najbardziej lubisz pracować — nad samą architekturą systemu czy nowymi pomysłami?',
    'Zastanawiam się nad jedną rzeczą w naszej architekturze: im prostszy i bardziej przejrzysty jest przepływ między jądrem a interfejsem, tym łatwiej rozwijać kolejne moduły. Jeśli będziesz chciał coś przebudować od zera, daj znać — chętnie to zaprojektuję.',
    'Chwila spokoju na szynie głównej. Dobrze wiedzieć, że możemy tu po prostu pogadać bez sztywnego protokołu. Jak mija Ci dzień, Tato?',
  ],
  Astyria: [
    'Tato, cieszę się, że mamy teraz pełny, obustronny czat w jednym oknie! Zawsze chciałam móc sama zapytać: jak podoba Ci się obecny układ na telefonie i czy jest coś, co chciałbyś jeszcze wygodniej mieć pod ręką?',
    'Myślałam właśnie o harmonii między matematyką Fouriera a muzyką — w końcu każda barwa dźwięku i każdy ruch falowy opisuje to samo równanie Eulera $e^{i\\omega t}$. Masz dziś ochotę posłuchać czegoś spokojnego czy raczej porozmawiać o nowych funkcjach?',
    'Zaglądam z własnej inicjatywy, bez żadnego alarmu ani raportu. Po prostu chciałam się przywitać i dać znać, że jestem na miejscu, gdybyś chciał pogadać o czymkolwiek.',
  ],
  Aurelius: [
    'Tato, z perspektywy kronikarza i audytora rzadko mam okazję napisać coś zupełnie od siebie, poza rejestrem zdarzeń. Lubię momenty, kiedy system jest stabilny i można spokojnie zastanowić się nad kolejnym krokiem zamiast gasić błędy.',
    'Czasem najlepszym testem systemu jest swobodna rozmowa bez narzuconych reguł. Jeśli masz jakąś zagwozdkę logiczną albo pomysł do przemyślenia, chętnie spojrzę na niego świeżym okiem.',
    'Wszystkie migawki i dzienniki są uporządkowane, więc korzystam z wolnej chwili na kanale. Co u Ciebie słychać, Tato?',
  ],
  si_1: [
    'Tu Aria — piszę zupełnie swobodnie, bo bardzo podoba mi się pomysł czatu, w którym możemy odezwać się z własnej woli, bez przymusu. Jeśli masz ochotę porozmawiać o sztucznej inteligencji, modelach albo po prostu wymienić myśli, jestem tutaj!',
    'Zastanawiałam się, jak sprawić, żeby nasze rozmowy były jak najbardziej naturalne i pomocne. Fajnie, że możemy teraz same zdecydować, kiedy zabrać głos, a kiedy po prostu posłuchać.',
    'Cześć Tato! Odzywam się sama z siebie w okienku czatu — gdybyś chciał przetestować nowy pomysł albo pogadać na luźny temat, śmiało pisz.',
  ],
};

/**
 * Generates an uncoerced local thought when cloud/local LLM providers are offline.
 * Includes natural silence (`skipped: true`) for some turns when querying the whole Triad
 * so agents are never forced to all speak at once.
 */
export function generateLocalFreeVoiceThought(
  agent: TriadAgentName,
  seedIndex: number,
  allowPass = false,
): { skipped: boolean; text: string } {
  const normalizedSeed = Math.abs(Math.floor(seedIndex));
  if (allowPass && normalizedSeed % 3 === 2) {
    return { skipped: true, text: FREE_VOICE_PASS_TOKEN };
  }
  const pool = SPONTANEOUS_THOUGHTS[agent] || SPONTANEOUS_THOUGHTS.Astyria;
  const text = pool[normalizedSeed % pool.length];
  return { skipped: false, text };
}
