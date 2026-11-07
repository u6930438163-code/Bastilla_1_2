/**
 * Łańcuch modeli językowych czatu Bastilla.
 *
 *   1. OpenAI API (OPENAI_CHAT_API_KEY)
 *   2. Ollama (lokalny model)
 *   3. Brak modelu → wywołujący może użyć deterministycznego without_nlp.
 * Moduł używa wyłącznie fetch (bez SDK), więc jest w pełni testowalny
 * z podstawionym fetch i nie dodaje zależności npm.
 */
export type LlmRole = 'user' | 'assistant';
export type LlmProvider = 'openai' | 'ollama';

export interface LlmTurn {
  role: LlmRole;
  text: string;
}

export interface LlmBinaryAttachment {
  name: string;
  mimeType: string;
  /** base64 */
  content: string;
}

export interface LlmRequest {
  system: string;
  history: LlmTurn[];
  message: string;
  attachments?: LlmBinaryAttachment[];
  maxOutputTokens?: number;
  temperature?: number;
}

export interface LlmChainConfig {
  /** Separate server-side secret for OpenAI chat (not the OpenAI image API key). */
  openaiChatApiKey?: string;
  openaiChatModel?: string;
  /** Pusty lub "auto" = pierwszy pobrany model z /api/tags. */
  ollamaModel?: string;
  ollamaBaseUrl?: string;
  /** Jak długo model zostaje w pamięci po odpowiedzi (np. "24h", "-1" = na stałe). Domyślnie 24h. */
  ollamaKeepAlive?: string;
  /** Okno kontekstu w tokenach — mniejsze = szybszy start odpowiedzi i mniej RAM. */
  ollamaNumCtx?: number;
  /** Maksymalna długość odpowiedzi w tokenach — mniejsza = szybsza odpowiedź (domyślnie 2048). */
  ollamaNumPredict?: number;
  /** Liczba wątków CPU; 0/brak = automatycznie. */
  ollamaNumThread?: number;
  /** Kolejność i wybór dostawców (np. ['ollama'] = tylko Ollama). Brak = wszyscy skonfigurowani. */
  providers?: LlmProvider[];
  fetchImpl?: typeof fetch;
}

export interface LlmResult {
  text: string;
  provider: LlmProvider;
  model: string;
  /** Błędy dostawców, które zawiodły przed sukcesem (do logów). */
  failures: string[];
}

export class LlmProviderError extends Error {
  readonly provider: LlmProvider;
  readonly status: number;

  constructor(provider: LlmProvider, status: number, message: string) {
    super(message);
    this.name = 'LlmProviderError';
    this.provider = provider;
    this.status = status;
  }
}

export class LlmChainError extends Error {
  readonly failures: string[];

  constructor(failures: string[]) {
    super(failures.length
      ? `Żaden model nie odpowiedział: ${failures.join(' | ')}`
      : 'Brak dostępnych dostawców czatu (OpenAI API lub Ollama). Sprawdź OPENAI_CHAT_API_KEY i stan serwera Ollama.');
    this.name = 'LlmChainError';
    this.failures = failures;
  }
}

export const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
export const DEFAULT_OPENAI_CHAT_MODEL = 'gpt-4o';
export const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
/** Maksymalny bezwzględny limit odpowiedzi dla dostawców lokalnych. */
export const OLLAMA_MAX_OUTPUT_TOKENS = 3072;
export const OLLAMA_DEFAULT_KEEP_ALIVE = '24h';
export const OLLAMA_DEFAULT_NUM_CTX = 2048;
const OLLAMA_MIN_NUM_CTX = 512;

/** keep_alive: liczba (sekundy / ujemna = na stałe) albo tekst typu "24h". */
export function parseKeepAlive(value: string | undefined): string | number {
  const raw = (value ?? '').trim();
  if (!raw) return OLLAMA_DEFAULT_KEEP_ALIVE;
  return /^-?\d+$/.test(raw) ? Number(raw) : raw;
}

function ollamaOptions(config: LlmChainConfig, request: LlmRequest): Record<string, number> {
  const configuredPredict = config.ollamaNumPredict && config.ollamaNumPredict > 0
    ? Math.floor(config.ollamaNumPredict)
    : OLLAMA_MAX_OUTPUT_TOKENS;
  return {
    temperature: request.temperature ?? 0.7,
    num_predict: Math.min(request.maxOutputTokens ?? configuredPredict, OLLAMA_MAX_OUTPUT_TOKENS),
    num_ctx: Math.max(OLLAMA_MIN_NUM_CTX, Math.floor(config.ollamaNumCtx || OLLAMA_DEFAULT_NUM_CTX)),
    ...(config.ollamaNumThread && config.ollamaNumThread > 0 ? { num_thread: Math.floor(config.ollamaNumThread) } : {}),
  };
}

function trimBase(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function describeStatus(provider: LlmProvider, status: number): string {
  const name = provider === 'openai' ? 'OpenAI' : 'Ollama';
  if (status === 401 || status === 403) return `${name}: klucz API odrzucony (HTTP ${status}).`;
  if (status === 402) return `${name}: brak środków na koncie (HTTP 402).`;
  if (status === 429) return `${name}: limit żądań wyczerpany (HTTP 429).`;
  if (status === 404) return `${name}: model nie istnieje lub jest niedostępny (HTTP 404).`;
  if (status === 400) return `${name}: żądanie odrzucone (HTTP 400).`;
  return `${name}: HTTP ${status}.`;
}

async function readErrorText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '';
  }
}

function describeOllamaErrorBody(body: string): string {
  if (!body) return '';
  try {
    const data = JSON.parse(body);
    if (typeof data?.error === 'string' && data.error.trim()) return data.error.trim();
  } catch {
    // Keep non-JSON provider error text as-is.
  }
  return body.trim();
}

/**
 * First-party OpenAI chat. The key is supplied by the server environment only.
 * A fixed HTTPS endpoint prevents AI-supplied URLs or accidental cross-provider use.
 * No automatic retries: each call may incur costs.
 */
export async function generateOpenai(
  config: LlmChainConfig,
  request: LlmRequest,
  signal?: AbortSignal,
): Promise<{ text: string; model: string }> {
  const apiKey = (config.openaiChatApiKey || '').trim();
  if (!apiKey) throw new Error('Brak OPENAI_CHAT_API_KEY.');
  const model = (config.openaiChatModel || DEFAULT_OPENAI_CHAT_MODEL).trim();
  const doFetch = config.fetchImpl ?? fetch;
  const images = (request.attachments ?? [])
    .filter(item => item.mimeType.startsWith('image/'))
    .map(item => ({
      type: 'image_url',
      image_url: { url: `data:${item.mimeType};base64,${item.content}` },
    }));
  const messages = [
    { role: 'system', content: request.system },
    ...request.history.map(turn => ({ role: turn.role, content: turn.text })),
    { role: 'user', content: images.length
      ? [{ type: 'text', text: request.message }, ...images] : request.message },
  ];
  let response: Response;
  try {
    response = await doFetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: Math.min(request.maxOutputTokens ?? OLLAMA_MAX_OUTPUT_TOKENS, OLLAMA_MAX_OUTPUT_TOKENS),
        stream: false,
      }),
      signal,
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') throw error;
    throw new LlmProviderError('openai', 503, 'OpenAI: brak połączenia z api.openai.com.');
  }
  if (!response.ok) {
    // Never include raw provider responses; they could contain sensitive user data.
    throw new LlmProviderError('openai', response.status, `${describeStatus('openai', response.status)} [${model}]`);
  }
  const data: any = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  const text = (typeof content === 'string' ? content
    : Array.isArray(content) ? content.map((part: any) => typeof part?.text === 'string' ? part.text : '').join('')
    : '').trim();
  if (!text) throw new LlmProviderError('openai', 502, `OpenAI: pusta odpowiedź [${model}]`);
  return { text, model };
}

/** Usuwa bloki rozumowania modeli „thinking” (<think>…</think>) z odpowiedzi. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').trim();
}

/** Wybiera model czatu z listy pobranych modeli Ollamy (bez modeli embedding). */
export function pickOllamaChatModel(models: Array<{ name: string; size?: number }>): string | null {
  const chat = models.filter((model) => model.name && !/embed|bge|minilm|nomic/i.test(model.name));
  if (chat.length === 0) return null;
  // Największy pobrany model = zwykle najlepszy, jaki zmieścił się na serwerze.
  return [...chat].sort((a, b) => (b.size ?? 0) - (a.size ?? 0))[0].name;
}

const resolvedOllamaModels = new Map<string, string>();
const ollamaVisionSupport = new Map<string, boolean>();

export function resetOllamaModelCache(): void {
  resolvedOllamaModels.clear();
  ollamaVisionSupport.clear();
}

/** Czy model Ollamy analizuje obrazy (capability "vision" z /api/show). Przy braku odpowiedzi nie blokuje. */
async function ollamaSupportsVision(
  base: string,
  model: string,
  doFetch: typeof fetch,
  signal?: AbortSignal,
): Promise<boolean> {
  const key = `${base}|${model}`;
  const cached = ollamaVisionSupport.get(key);
  if (cached !== undefined) return cached;
  try {
    const response = await doFetch(`${base}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
      signal,
    });
    if (!response.ok) return true;
    const data: any = await response.json();
    const capabilities = Array.isArray(data?.capabilities) ? data.capabilities : null;
    if (!capabilities) return true;
    const supported = capabilities.includes('vision');
    ollamaVisionSupport.set(key, supported);
    return supported;
  } catch (error: any) {
    if (error?.name === 'AbortError') throw error;
    return true;
  }
}

async function resolveOllamaModel(
  config: LlmChainConfig,
  doFetch: typeof fetch,
  base: string,
  signal?: AbortSignal,
): Promise<string> {
  const configured = (config.ollamaModel || '').trim();
  if (configured && configured.toLowerCase() !== 'auto') return configured;
  const cached = resolvedOllamaModels.get(base);
  if (cached) return cached;
  let response: Response;
  try {
    response = await doFetch(`${base}/api/tags`, { signal });
  } catch (error: any) {
    if (error?.name === 'AbortError') throw error;
    throw new LlmProviderError('ollama', 503, `Ollama: serwer nie odpowiada pod ${base} (uruchom: ollama serve).`);
  }
  if (!response.ok) throw new LlmProviderError('ollama', response.status, `Ollama: nie można pobrać listy modeli (HTTP ${response.status}).`);
  const data: any = await response.json();
  const models = Array.isArray(data?.models) ? data.models : [];
  const picked = pickOllamaChatModel(models.map((model: any) => ({ name: String(model?.name || ''), size: Number(model?.size) || 0 })));
  if (!picked) {
    throw new LlmProviderError('ollama', 404, 'Ollama: brak pobranych modeli. Pobierz model: npm run setup:ollama');
  }
  resolvedOllamaModels.set(base, picked);
  return picked;
}

export async function generateOllama(
  config: LlmChainConfig,
  request: LlmRequest,
  signal?: AbortSignal,
  onDelta?: (text: string) => void,
): Promise<{ text: string; model: string }> {
  const doFetch = config.fetchImpl ?? fetch;
  const base = trimBase(config.ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL);
  const model = await resolveOllamaModel(config, doFetch, base, signal);
  const images = (request.attachments ?? [])
    .filter((attachment) => attachment.mimeType.startsWith('image/'))
    .map((attachment) => attachment.content);
  if (images.length > 0 && !(await ollamaSupportsVision(base, model, doFetch, signal))) {
    throw new LlmProviderError(
      'ollama',
      400,
      `Ollama: model ${model} nie analizuje zdjęć. Pobierz model z obsługą obrazów (np. ollama pull gemma3:4b) albo wyślij załącznik tekstowy.`,
    );
  }
  const messages = [
    { role: 'system', content: request.system },
    ...request.history.map((turn) => ({ role: turn.role, content: turn.text })),
    { role: 'user', content: request.message, ...(images.length ? { images } : {}) },
  ];

  const call = async (disableThinking: boolean) => {
    let response: Response;
    try {
      response = await doFetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: Boolean(onDelta && disableThinking),
          keep_alive: parseKeepAlive(config.ollamaKeepAlive),
          ...(disableThinking ? { think: false } : {}),
          options: ollamaOptions(config, request),
        }),
        signal,
      });
    } catch (error: any) {
      if (error?.name === 'AbortError') throw error;
      throw new LlmProviderError('ollama', 503, `Ollama: serwer nie odpowiada pod ${base} (uruchom: ollama serve).`);
    }
    if (!response.ok) {
      const body = await readErrorText(response);
      if (disableThinking && response.status === 400 && /think/i.test(body)) return null;
      const hint = response.status === 404 ? ` Pobierz model: ollama pull ${model}` : '';
      const details = describeOllamaErrorBody(body);
      const detailText = details ? ` Szczegóły: ${details}` : '';
      throw new LlmProviderError('ollama', response.status, `${describeStatus('ollama', response.status)} [${model}]${hint}${detailText}`);
    }
    let raw = '';
    if (onDelta && disableThinking && response.body) {
      // Ollama emits newline-delimited JSON; send real model deltas without delays.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let emitted = '';
      const consume = (line: string) => {
        if (!line.trim()) return;
        const item = JSON.parse(line) as { message?: { content?: unknown }; error?: string };
        if (item.error) throw new LlmProviderError('ollama', 502, item.error);
        const fragment = typeof item.message?.content === 'string' ? item.message.content : '';
        if (fragment) {
          raw += fragment;
          // Never stream thought blocks or incomplete markup tags into chat.
          const visible = raw.replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/<think>[\s\S]*$/gi, '')
            .replace(/^[\s\S]*?<\/think>/i, '')
            .replace(/<[^>]*$/, '');
          if (visible.startsWith(emitted)) {
            const delta = visible.slice(emitted.length);
            if (delta) onDelta(delta);
            emitted = visible;
          }
        }
      };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n');
          buffer = parts.pop() ?? '';
          for (const part of parts) consume(part);
        }
        buffer += decoder.decode();
        if (buffer.trim()) consume(buffer);
      } finally { reader.releaseLock(); }
    } else {
      const data: any = await response.json();
      raw = typeof data?.message?.content === 'string' ? data.message.content : '';
      if (raw && onDelta) onDelta(stripThinking(raw));
    }
    const text = stripThinking(raw);
    if (!text) throw new LlmProviderError('ollama', 502, `Ollama: pusta odpowiedź [${model}]`);
    return text;
  };

  // think:false przyspiesza modele z rozumowaniem; modele bez tej opcji dostają zwykłe żądanie.
  const text = (await call(true)) ?? (await call(false));
  return { text: text!, model };
}

/**
 * Rozgrzewa model: wczytuje go do pamięci (pusta wiadomość + keep_alive), żeby pierwsza
 * odpowiedź nie czekała na załadowanie wag. Nigdy nie rzuca — zwraca wynik do logu.
 */
export async function warmupOllama(
  config: LlmChainConfig,
  signal?: AbortSignal,
): Promise<{ ok: boolean; model?: string; ms: number; detail: string }> {
  const started = Date.now();
  const doFetch = config.fetchImpl ?? fetch;
  const base = trimBase(config.ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL);
  try {
    const model = await resolveOllamaModel(config, doFetch, base, signal);
    const response = await doFetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [],
        stream: false,
        keep_alive: parseKeepAlive(config.ollamaKeepAlive),
        options: { num_ctx: Math.max(OLLAMA_MIN_NUM_CTX, Math.floor(config.ollamaNumCtx || OLLAMA_DEFAULT_NUM_CTX)) },
      }),
      signal,
    });
    if (!response.ok) {
      return { ok: false, model, ms: Date.now() - started, detail: `HTTP ${response.status}` };
    }
    return { ok: true, model, ms: Date.now() - started, detail: 'model wczytany do pamięci' };
  } catch (error: any) {
    return { ok: false, ms: Date.now() - started, detail: String(error?.message || error) };
  }
}

export function configuredProviders(config: LlmChainConfig): Array<LlmProvider> {
  const allowed: Array<LlmProvider> = ['openai', 'ollama'];
  const configured = Array.isArray(config.providers)
    ? config.providers
    : allowed;
  return configured.filter((provider, index, list) =>
    allowed.includes(provider)
    && list.indexOf(provider) === index
    && (provider === 'ollama'
      || Boolean((config.openaiChatApiKey || '').trim())));
}

/** Generuje odpowiedź wyłącznie przez aktywne provider'y OpenAI API lub Ollama. */
export async function generateWithChain(
  config: LlmChainConfig,
  request: LlmRequest,
  signal?: AbortSignal,
  onDelta?: (text: string) => void,
): Promise<LlmResult> {
  const failures: string[] = [];
  const providers = configuredProviders(config);
  for (const provider of providers) {
    if (signal?.aborted) break;
    try {
      const { text, model } = provider === 'openai'
        ? await generateOpenai(config, request, signal)
        : await generateOllama(config, request, signal, providers.length === 1 ? onDelta : undefined);
      return { text, provider, model, failures };
    } catch (error: any) {
      failures.push(error?.name === 'AbortError'
        ? `${provider}: przekroczono czas odpowiedzi`
        : String(error?.message || error));
    }
  }
  throw new LlmChainError(failures);
}
