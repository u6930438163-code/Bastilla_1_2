import React, { useEffect, useState } from 'react';
import { DEFAULT_EXCLUSIVE_OLLAMA_MODEL, isSameOllamaModel } from '../kernel/ollamaManager';

type OllamaModel = {
  name?: string;
  model?: string;
  size?: number;
  modified_at?: string;
  details?: { parameter_size?: string; quantization_level?: string };
};

type Inventory = {
  models: OllamaModel[];
  configuredModel: string;
  connected: boolean;
  error?: string;
};

type SyncExclusiveResponse = {
  ok: boolean;
  connected: boolean;
  configuredModel: string;
  pulled: boolean;
  warmedUp: boolean;
  keptModels: string[];
  removedModels: string[];
  failedRemovals: Array<{ model: string; error: string }>;
  models: OllamaModel[];
  error?: string;
  setupCommand?: string;
};

const formatSize = (bytes?: number) =>
  typeof bytes === 'number' ? `${(bytes / 1024 ** 3).toFixed(2)} GiB` : '—';

export function OllamaModelManager() {
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copiedCommand, setCopiedCommand] = useState(false);

  const refresh = async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/ollama/models', { cache: 'no-store', signal });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(
          'Serwer proxy zwrócił odpowiedź niebędącą formatem JSON. Ollama jest offline lub nieuruchomiona.',
        );
      }
      const data = (await response.json()) as Inventory;
      setInventory(data);
      if (data.connected === false && data.error) {
        setError(data.error);
      } else {
        setError('');
      }
    } catch (cause) {
      if (signal?.aborted) return;
      setError(cause instanceof Error ? cause.message : 'Błąd połączenia z Ollama');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, []);

  const handleSyncExclusiveQwen = async (targetModel = DEFAULT_EXCLUSIVE_OLLAMA_MODEL) => {
    if (busyAction) return;
    setBusyAction(`Pobieranie i uruchamianie ${targetModel} oraz usuwanie pozostałych modeli…`);
    setError('');
    setStatusMessage(null);
    try {
      const response = await fetch('/api/ollama/sync-exclusive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: targetModel,
          pruneOthers: true,
          warmup: true,
        }),
      });
      const data = (await response.json()) as SyncExclusiveResponse;
      setInventory((prev) => ({
        models: Array.isArray(data.models) ? data.models : prev?.models ?? [],
        configuredModel: data.configuredModel || targetModel,
        connected: Boolean(data.connected),
        error: data.error,
      }));
      if (data.ok && data.connected) {
        const removedNote =
          data.removedModels.length > 0
            ? ` Usunięto pozostałe modele (${data.removedModels.join(', ')}).`
            : ' Brak innych modeli do usunięcia.';
        setStatusMessage(
          `Model ${data.configuredModel} został pobrany, skonfigurowany i uruchomiony w pamięci Ollamy.${removedNote}`,
        );
        setError('');
      } else {
        setStatusMessage(
          `Skonfigurowano docelowy model w systemie jako ${data.configuredModel}.`,
        );
        if (data.error) setError(data.error);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nie udało się skonfigurować modelu Ollama.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSelectModel = async (modelName: string) => {
    if (busyAction) return;
    setBusyAction(`Uruchamianie modelu ${modelName}…`);
    setError('');
    setStatusMessage(null);
    try {
      const response = await fetch('/api/ollama/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Nie udało się przełączyć modelu.');
      }
      setStatusMessage(
        `Aktywny model ustawiony na ${data.configuredModel} (${data.warmedUp ? 'uruchomiony w pamięci' : data.detail}).`,
      );
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Błąd przełączania modelu.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteModel = async (modelName: string) => {
    if (busyAction) return;
    setBusyAction(`Usuwanie modelu ${modelName}…`);
    setError('');
    setStatusMessage(null);
    try {
      const response = await fetch('/api/ollama/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || `Nie udało się usunąć modelu ${modelName}.`);
      }
      setStatusMessage(`Usunięto model ${modelName} z lokalnej Ollamy.`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Błąd usuwania modelu.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText('bash scripts/setup-ollama.sh dolphin-mixtral:8x7b');
      setCopiedCommand(true);
      setTimeout(() => setCopiedCommand(false), 2500);
    } catch {
      // Clipboard API może być niedostępne w niektórych kontekstach.
    }
  };

  const configuredModel = inventory?.configuredModel || DEFAULT_EXCLUSIVE_OLLAMA_MODEL;

  return (
    <section
      aria-label="Menedżer modeli Ollama"
      className="space-y-3 rounded-xl border border-cyan-800/40 bg-slate-950/80 p-4 text-slate-100"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-cyan-100">Menedżer modeli Ollama</h2>
          <span
            className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
              inventory?.connected
                ? 'border border-emerald-500/40 bg-emerald-950/60 text-emerald-300'
                : 'border border-amber-500/40 bg-amber-950/60 text-amber-300'
            }`}
          >
            {inventory?.connected ? 'OLLAMA ONLINE' : 'OLLAMA OFFLINE'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={Boolean(busyAction)}
            onClick={() => void handleSyncExclusiveQwen(DEFAULT_EXCLUSIVE_OLLAMA_MODEL)}
            className="rounded-md border border-emerald-500/60 bg-emerald-950/70 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-900/80 disabled:opacity-50"
          >
            Pobierz i uruchom dolphin-mixtral:8x7b (usuń pozostałe)
          </button>
          <button
            type="button"
            disabled={Boolean(busyAction)}
            onClick={() => {
              setLoading(true);
              void refresh();
            }}
            className="rounded-md border border-cyan-700 px-3 py-1.5 text-xs hover:bg-cyan-900/30 disabled:opacity-50"
          >
            Odśwież listę
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <p>
          Model skonfigurowany:{' '}
          <strong className="font-mono text-cyan-200">{configuredModel}</strong>
        </p>
        <div className="flex items-center gap-2">
          <code className="rounded border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[11px] text-cyan-300">
            bash scripts/setup-ollama.sh dolphin-mixtral:8x7b
          </code>
          <button
            type="button"
            onClick={() => void handleCopyCommand()}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-300 hover:border-cyan-600 hover:text-white"
          >
            {copiedCommand ? 'Skopiowano' : 'Kopiuj komendę'}
          </button>
        </div>
      </div>

      {(loading || busyAction) && (
        <p role="status" className="text-xs text-cyan-300">
          {busyAction || 'Łączenie z Ollama…'}
        </p>
      )}

      {statusMessage && (
        <div
          role="status"
          className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 p-3 text-xs text-emerald-200"
        >
          {statusMessage}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-3 text-xs text-amber-300"
        >
          {error}
        </div>
      )}

      {!loading && !error && inventory?.connected && inventory?.models.length === 0 && (
        <p className="text-sm text-slate-400">Brak zainstalowanych modeli.</p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {inventory?.models.map((model) => {
          const modelName = model.name ?? model.model ?? '';
          const isConfigured = isSameOllamaModel(modelName, configuredModel);
          return (
            <div
              key={modelName}
              className={`min-w-0 rounded-lg border p-3 ${
                isConfigured
                  ? 'border-emerald-500/60 bg-emerald-950/20'
                  : 'border-slate-700 bg-slate-900'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="break-all font-mono text-sm font-semibold text-cyan-200">
                  {modelName}
                </div>
                {isConfigured && (
                  <span className="rounded bg-emerald-900/70 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                    AKTYWNY
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {formatSize(model.size)} · {model.details?.parameter_size ?? 'Parametry nieznane'} ·{' '}
                {model.details?.quantization_level ?? 'Kwantyzacja nieznana'}
              </div>
              {modelName && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {!isConfigured && (
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={() => void handleSelectModel(modelName)}
                      className="rounded border border-cyan-600/60 bg-cyan-950/60 px-2.5 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-900/60 disabled:opacity-50"
                    >
                      Ustaw aktywny i uruchom
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={Boolean(busyAction)}
                    onClick={() => void handleDeleteModel(modelName)}
                    className="rounded border border-rose-600/50 bg-rose-950/50 px-2.5 py-1 text-[11px] font-semibold text-rose-200 hover:bg-rose-900/60 disabled:opacity-50"
                  >
                    Usuń model
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-500">
        Przycisk „Pobierz i uruchom dolphin-mixtral:8x7b (usuń pozostałe)” lub polecenie{' '}
        <code>npm run setup:ollama</code> pobiera <code>dolphin-mixtral:8x7b</code>, usuwa wszystkie inne modele z
        lokalnej Ollamy i ładuje model do pamięci z <code>keep_alive=24h</code>.
      </p>
    </section>
  );
}
