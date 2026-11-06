/**
 * Zarządzanie modelami lokalnej usługi Ollama:
 * - pobieranie wybranego modelu (domyślnie dolphin-mixtral:8x7b),
 * - usuwanie wszystkich pozostałych modeli z lokalnej Ollamy,
 * - rozgrzewka i uruchomienie modelu w pamięci (keep_alive).
 *
 * Moduł przyjmuje wstrzykiwane fetchImpl, dzięki czemu jest w 100% testowalny
 * jednostkowo i nigdy nie symuluje połączenia, gdy serwer Ollama nie odpowiada.
 */

export const DEFAULT_EXCLUSIVE_OLLAMA_MODEL = 'dolphin-mixtral:8x7b';

export interface OllamaTagModel {
  name: string;
  model?: string;
  size?: number;
  modified_at?: string;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
  };
}

export interface OllamaExclusiveSyncOptions {
  baseUrl: string;
  targetModel?: string;
  pruneOthers?: boolean;
  warmup?: boolean;
  keepAlive?: string;
  numCtx?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface OllamaExclusiveSyncResult {
  ok: boolean;
  connected: boolean;
  configuredModel: string;
  pulled: boolean;
  warmedUp: boolean;
  keptModels: string[];
  removedModels: string[];
  failedRemovals: Array<{ model: string; error: string }>;
  models: OllamaTagModel[];
  error?: string;
}

/**
 * Porównuje nazwy modeli Ollamy z uwzględnieniem domyślnego tagu `:latest`.
 */
export function isSameOllamaModel(a: string, b: string): boolean {
  const norm = (val: string) => {
    const trimmed = val.trim().toLowerCase();
    return trimmed.includes(':') ? trimmed : `${trimmed}:latest`;
  };
  return norm(a) === norm(b);
}

function normalizeBaseUrl(baseUrl: string): string {
  return (baseUrl || 'http://127.0.0.1:11434').trim().replace(/\/+$/, '');
}

/**
 * Pobiera aktualną listę zainstalowanych modeli z GET /api/tags.
 */
export async function listOllamaModels(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<OllamaTagModel[]> {
  const base = normalizeBaseUrl(baseUrl);
  const response = await fetchImpl(`${base}/api/tags`, { signal });
  if (!response.ok) {
    throw new Error(`Ollama /api/tags zwróciło HTTP ${response.status}`);
  }
  const data = (await response.json()) as { models?: unknown[] };
  if (!Array.isArray(data?.models)) return [];
  return data.models
    .map((item: any) => ({
      name: String(item?.name || item?.model || '').trim(),
      model: typeof item?.model === 'string' ? item.model : undefined,
      size: typeof item?.size === 'number' ? item.size : undefined,
      modified_at: typeof item?.modified_at === 'string' ? item.modified_at : undefined,
      details: item?.details && typeof item.details === 'object' ? item.details : undefined,
    }))
    .filter((item) => Boolean(item.name));
}

/**
 * Usuwa pojedynczy model z lokalnej Ollamy przez DELETE /api/delete.
 */
export async function deleteOllamaModel(
  baseUrl: string,
  modelName: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<void> {
  const base = normalizeBaseUrl(baseUrl);
  const trimmed = modelName.trim();
  if (!trimmed) throw new Error('Nazwa modelu do usunięcia nie może być pusta.');
  const response = await fetchImpl(`${base}/api/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: trimmed }),
    signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
}

/**
 * Pobiera docelowy model (domyślnie qwen3:14b), usuwa wszystkie inne modele
 * oraz uruchamia (rozgrzewa) model w pamięci Ollamy.
 */
export async function syncOllamaExclusiveModel(
  options: OllamaExclusiveSyncOptions,
): Promise<OllamaExclusiveSyncResult> {
  const base = normalizeBaseUrl(options.baseUrl);
  const targetModel = (options.targetModel || DEFAULT_EXCLUSIVE_OLLAMA_MODEL).trim() || DEFAULT_EXCLUSIVE_OLLAMA_MODEL;
  // Never delete installed models unless the operator explicitly opts in.
  const pruneOthers = options.pruneOthers === true;
  const shouldWarmup = options.warmup !== false;
  const keepAlive = (options.keepAlive || '24h').trim() || '24h';
  const numCtx = options.numCtx && options.numCtx >= 512 ? Math.floor(options.numCtx) : 4096;
  const doFetch = options.fetchImpl ?? fetch;

  const result: OllamaExclusiveSyncResult = {
    ok: false,
    connected: false,
    configuredModel: targetModel,
    pulled: false,
    warmedUp: false,
    keptModels: [],
    removedModels: [],
    failedRemovals: [],
    models: [],
  };

  // 1. Sprawdź czy serwer Ollama odpowiada
  try {
    const versionRes = await doFetch(`${base}/api/version`, { signal: options.signal });
    if (!versionRes.ok) {
      result.error = `Serwer Ollama pod ${base} zwrócił HTTP ${versionRes.status}.`;
      return result;
    }
    result.connected = true;
  } catch (err: any) {
    result.error = `Serwer Ollama nie odpowiada pod ${base} (${String(err?.message || err)}). Uruchom na swoim systemie: bash scripts/setup-ollama.sh ${targetModel}`;
    return result;
  }

  // 2. Pobierz model (POST /api/pull)
  try {
    const pullRes = await doFetch(`${base}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: targetModel, stream: false }),
      signal: options.signal,
    });
    if (!pullRes.ok) {
      const errText = await pullRes.text().catch(() => '');
      result.error = `Nie udało się pobrać modelu ${targetModel} (HTTP ${pullRes.status}${errText ? `: ${errText.slice(0, 200)}` : ''}).`;
      return result;
    }
    result.pulled = true;
  } catch (err: any) {
    result.error = `Błąd podczas pobierania modelu ${targetModel}: ${String(err?.message || err)}`;
    return result;
  }

  // 3. Pobierz listę modeli i usuń wszystkie poza docelowym
  try {
    const installed = await listOllamaModels(base, doFetch, options.signal);
    if (pruneOthers) {
      for (const item of installed) {
        if (isSameOllamaModel(item.name, targetModel)) {
          result.keptModels.push(item.name);
          continue;
        }
        try {
          await deleteOllamaModel(base, item.name, doFetch, options.signal);
          result.removedModels.push(item.name);
        } catch (delErr: any) {
          result.failedRemovals.push({
            model: item.name,
            error: String(delErr?.message || delErr),
          });
        }
      }
    } else {
      result.keptModels = installed.map((m) => m.name);
    }

    result.models = await listOllamaModels(base, doFetch, options.signal);
    if (result.keptModels.length === 0 && result.models.some((m) => isSameOllamaModel(m.name, targetModel))) {
      result.keptModels = result.models.filter((m) => isSameOllamaModel(m.name, targetModel)).map((m) => m.name);
    }
  } catch (err: any) {
    result.error = `Błąd podczas synchronizacji listy modeli: ${String(err?.message || err)}`;
    return result;
  }

  // 4. Uruchom / rozgrzej model w pamięci (POST /api/chat z pustą tablicą messages)
  if (shouldWarmup) {
    try {
      const warmRes = await doFetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: targetModel,
          messages: [],
          stream: false,
          keep_alive: keepAlive,
          options: { num_ctx: numCtx },
        }),
        signal: options.signal,
      });
      if (!warmRes.ok) {
        const errBody = await warmRes.text().catch(() => '');
        result.error = `Model ${targetModel} został pobrany, ale nie udało się go uruchomić w pamięci (HTTP ${warmRes.status}${errBody ? `: ${errBody.slice(0, 200)}` : ''}).`;
        return result;
      }
      result.warmedUp = true;
    } catch (err: any) {
      result.error = `Model ${targetModel} został pobrany, ale rozgrzewka nie powiodła się: ${String(err?.message || err)}`;
      return result;
    }
  }

  result.ok = result.failedRemovals.length === 0;
  if (!result.ok) {
    result.error = `Nie udało się usunąć niektórych modeli: ${result.failedRemovals.map((f) => `${f.model} (${f.error})`).join(', ')}`;
  }
  return result;
}
