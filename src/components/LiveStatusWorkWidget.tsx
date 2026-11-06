import React, { useEffect, useState } from 'react';
import { Activity, Bot, Pause, Play, RefreshCw, Server } from 'lucide-react';
import { getLiveStatusPath, getLiveStatusSpec, parseLiveStatus } from '../lib/liveStatusData.mjs';

type Data = Record<string, unknown>;
type Source = 'ollama_inventory' | 'agent_monitor';
type Agent = { name: string; status: string; enabled: boolean; lastCheck: string; error: string };
type OllamaSnapshot = { source: 'ollama_inventory'; connected: boolean; configuredModel: string; models: string[]; error: string };
type AgentSnapshot = { source: 'agent_monitor'; agents: Agent[]; note: string };
type Snapshot = OllamaSnapshot | AgentSnapshot;
type FetchStatus = 'connecting' | 'ready' | 'error';

const sourceNames: Record<Source, string> = {
  ollama_inventory: 'Ollama',
  agent_monitor: 'Agenci AI',
};
const short = (value: unknown, max = 120) => typeof value === 'string' ? value.slice(0, max) : '';
const showTime = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleTimeString('pl-PL') : 'Brak pomiaru';
};

export function LiveStatusWorkWidget({
  block, onPrompt,
}: {
  block: Data;
  onPrompt: (prompt: string) => void;
}) {
  const spec = getLiveStatusSpec(block);
  const [selectedSource, setSelectedSource] = useState<Source>((spec?.source || 'ollama_inventory') as Source);
  const [enabled, setEnabled] = useState(true);
  const [result, setResult] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<FetchStatus>('connecting');
  const [error, setError] = useState('');
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const intervalMs = spec?.intervalMs ?? 15000;

  useEffect(() => {
    if (!spec || !enabled) return;
    const endpoint = getLiveStatusPath(selectedSource);
    if (!endpoint) return;
    let disposed = false;
    let activeController: AbortController | null = null;
    const poll = async () => {
      if (disposed || document.hidden || activeController) return;
      const controller = new AbortController();
      activeController = controller;
      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) throw new Error('Serwer nie zwrócił JSON');
        const payload: unknown = await response.json();
        const snapshot = parseLiveStatus(selectedSource, payload) as Snapshot;
        if (!disposed) {
          setResult(snapshot);
          setError('');
          setStatus('ready');
        }
      } catch (cause) {
        if (!disposed && !controller.signal.aborted) {
          setStatus('error');
          setError(cause instanceof Error ? cause.message.slice(0, 160) : 'Brak połączenia');
        }
      } finally {
        if (activeController === controller) activeController = null;
      }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, intervalMs);
    const onVisible = () => { if (!document.hidden) void poll(); };
    const onWorkspace = (event: Event) => {
      const topic = (event as CustomEvent<{ topic?: string }>).detail?.topic;
      if (topic === 'agents' || topic === 'ollama') void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('bastilla:workspace-event', onWorkspace);
    return () => {
      disposed = true;
      activeController?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('bastilla:workspace-event', onWorkspace);
    };
  }, [selectedSource, enabled, intervalMs, refreshIndex, spec?.source]);

  if (!spec) return <p className="text-xs text-amber-300">Nieobsługiwane źródło karty LIVE.</p>;

  const offline = status === 'error';
  const sourceResult = result?.source === selectedSource ? result : null;
  const agents = sourceResult?.source === 'agent_monitor' ? sourceResult.agents : [];
  const visibleAgents = onlyProblems ? agents.filter(agent => agent.status !== 'online') : agents;
  const ollama = sourceResult?.source === 'ollama_inventory' ? sourceResult : null;

  const diagnosticsDraft = selectedSource === 'ollama_inventory'
    ? 'Sprawdź stan Ollamy na podstawie rzeczywistego API i logów, bez automatycznego resetowania lub instalowania: ' +
      JSON.stringify({ connected: ollama?.connected ?? null, model: ollama?.configuredModel ?? null, error: ollama?.error ?? error })
    : 'Sprawdź osobno rzeczywiste workery Aria/Alex/Astyria/Aurelius. Monitoring wspólnej Ollamy nie oznacza autonomicznej pracy. Zweryfikuj heartbeat i logi: ' +
      JSON.stringify(agents.map(a => ({ name: a.name, monitoringStatus: a.status, lastCheck: a.lastCheck })));

  return <section aria-label="Karta statusu LIVE" className="min-w-0 space-y-3 rounded-xl border border-cyan-800/60 bg-[#071827] p-3 text-slate-100">
    <header className="flex flex-wrap items-center gap-2">
      {selectedSource === 'ollama_inventory' ? <Server size={16} className="text-cyan-300"/> : <Bot size={16} className="text-cyan-300"/>}
      <strong className="flex-1 text-sm">{short(block.title, 100) || 'Status systemu · LIVE'}</strong>
      <span role="status" className={'flex items-center gap-1 text-xs ' + (offline ? 'text-amber-300' : enabled && status === 'ready' ? 'text-emerald-300' : 'text-slate-400')}>
        <Activity size={13}/>{!enabled ? 'Wstrzymane' : offline ? 'Błąd odczytu' : status === 'ready' ? 'Odczyt LIVE' : 'Łączenie…'}
      </span>
    </header>
    <div className="flex flex-wrap gap-2 text-xs">
      <label className="flex items-center gap-1 text-slate-300">Źródło
        <select className="rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-slate-100"
          value={selectedSource} onChange={event => {
            setSelectedSource(event.target.value as Source);
            setResult(null);
            setError('');
            setStatus('connecting');
          }}>
          <option value="ollama_inventory">{sourceNames.ollama_inventory}</option>
          <option value="agent_monitor">{sourceNames.agent_monitor}</option>
        </select>
      </label>
      <button type="button" aria-pressed={enabled} onClick={() => setEnabled(v => !v)}
        className="inline-flex items-center gap-1 rounded-lg border border-cyan-800 px-2.5 py-1.5 text-cyan-100 hover:bg-cyan-950/60">
        {enabled ? <Pause size={13}/> : <Play size={13}/>}
        {enabled ? 'Wstrzymaj' : 'Włącz LIVE'}
      </button>
      <button type="button" disabled={!enabled} onClick={() => setRefreshIndex(n => n + 1)}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-2.5 py-1.5 text-slate-200 disabled:opacity-40">
        <RefreshCw size={13}/> Odśwież
      </button>
    </div>
    {offline && enabled && <p role="alert" className="rounded-lg border border-amber-800/60 p-2 text-xs text-amber-200">
      {sourceResult ? 'Ostatni odczyt jest nieaktualny. ' : 'Brak bieżącego odczytu. '}{error}
    </p>}
    {!sourceResult && <p className="text-xs text-slate-400">{enabled ? 'Oczekiwanie na potwierdzone dane…' : 'Brak pobranych danych.'}</p>}
    {ollama && <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-900/70 p-3">
        <span className="text-xs text-slate-300">API Ollama</span>
        <strong className={'text-xs ' + (ollama.connected ? 'text-emerald-300' : 'text-rose-300')}>
          {ollama.connected ? 'Dostępne' : 'Niedostępne'}
        </strong>
      </div>
      <div className="rounded-lg border border-slate-800 p-3 text-xs">
        <p className="text-slate-400">Model skonfigurowany</p>
        <p className="mt-1 break-all font-mono text-cyan-200">{ollama.configuredModel || 'Brak danych'}</p>
        <p className="mt-2 text-slate-400">Modele wykryte: {ollama.models.length}</p>
        {ollama.models.length > 0 && <p className="mt-1 break-words text-slate-200">{ollama.models.join(' · ')}</p>}
        {ollama.error && <p className="mt-2 text-amber-200">{ollama.error}</p>}
      </div>
      <p className="text-[10px] text-slate-500">Dostępność API nie potwierdza uruchomienia modelu w RAM ani bieżącej inferencji.</p>
    </div>}
    {sourceResult?.source === 'agent_monitor' && <div className="space-y-2">
      <label className="flex items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" checked={onlyProblems} onChange={e => setOnlyProblems(e.target.checked)} className="accent-cyan-500"/>
        Tylko wymagające sprawdzenia
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visibleAgents.map(agent => <article key={agent.name} className="min-w-0 rounded-lg border border-slate-700 bg-slate-900/60 p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <strong>{agent.name}</strong>
            <span className={agent.status === 'online' ? 'text-emerald-300' : agent.status === 'offline' ? 'text-rose-300' : 'text-amber-300'}>
              {agent.status === 'online' ? 'Ollama odpowiada' : agent.status === 'offline' ? 'Ollama offline' : 'Niezweryfikowany'}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Odczyt: {showTime(agent.lastCheck)}</p>
          {agent.error && <p className="mt-1 break-words text-[11px] text-amber-200">{agent.error}</p>}
        </article>)}
      </div>
      {!visibleAgents.length && <p className="text-xs text-slate-400">Brak agentów w wybranym filtrze.</p>}
      <p className="text-[10px] text-slate-500">{sourceResult.note}</p>
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-2">
      <span className="text-[10px] text-slate-400">GET · co {intervalMs / 1000} s · bez wykonywania poleceń</span>
      <button type="button" onClick={() => onPrompt(diagnosticsDraft)}
        className="rounded-lg border border-sky-700 px-3 py-2 text-xs text-sky-100 hover:bg-sky-950">
        Przygotuj diagnozę dla AI
      </button>
    </div>
  </section>;
}
