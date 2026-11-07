import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Pause, Play, RefreshCw } from 'lucide-react';
import { useLiveCardVisibility } from '../hooks/useLiveCardVisibility';

type LogLevel = 'error' | 'success' | 'info';
type LogItem = { id: string; timestamp: string; level: string; category: LogLevel; source: string; message: string };
type LogSnapshot = {
  counts: { all: number; errors: number; success: number; info: number };
  logs: LogItem[];
};
type Filter = 'all' | 'error' | 'success' | 'info';
type Agent = 'Aria' | 'Alex' | 'Astyria' | 'Aurelius';
const ENDPOINT = '/api/operations/logs?filter=all';
const buttonClass = 'rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800';
const short = (value: unknown, max = 300) => typeof value === 'string' ? value.slice(0, max) : '';
function parseSnapshot(payload: unknown): LogSnapshot {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Nieprawidłowe dane logów');
  const object = payload as Record<string, unknown>;
  if (!Array.isArray(object.logs)) throw new Error('Brak logów w odpowiedzi serwera');
  const logs: LogItem[] = object.logs.slice(0, 100)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry, index) => ({
      id: short(entry.id, 80) || String(index),
      timestamp: short(entry.timestamp, 80),
      level: short(entry.level, 20),
      category: ['error', 'success', 'info'].includes(String(entry.category)) ? entry.category as LogLevel : 'info',
      source: short(entry.source, 40),
      message: short(entry.message, 900),
    }));
  const actual = object.counts && typeof object.counts === 'object' && !Array.isArray(object.counts)
    ? object.counts as Record<string, unknown> : {};
  const count = (key: string) => typeof actual[key] === 'number' && Number.isFinite(actual[key])
    ? Math.max(0, Math.min(100000, actual[key] as number)) : 0;
  return { counts: { all: count('all'), errors: count('errors'), success: count('success'), info: count('info') }, logs };
}
function localTime(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleTimeString('pl-PL') : '—';
}
export function LiveLogsWorkWidget({
  onPrompt,
}: {
  onPrompt: (prompt: string) => void;
}) {
  const { cardRef, cardVisible } = useLiveCardVisibility<HTMLElement>();
  const [enabled, setEnabled] = useState(true);
  const [snapshot, setSnapshot] = useState<LogSnapshot | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'locked'>('loading');
  const [error, setError] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const [lastUpdated, setLastUpdated] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<Agent>('Alex');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !cardVisible) return;
    let disposed = false;
    let active: AbortController | null = null;
    const poll = async () => {
      if (document.hidden || disposed || active) return;
      const controller = new AbortController();
      active = controller;
      let timedOut = false;
      const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 8000);
      try {
        const response = await fetch(ENDPOINT, { method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        if (response.status === 401 || response.status === 403 || response.status === 503) {
          if (!disposed) {
            setStatus('locked');
            setSnapshot(null);
            setLastUpdated('');
            setError(response.status === 503
              ? 'Usługa logów jest niedostępna (HTTP 503). Sprawdź backend i konfigurację serwera.'
              : 'Brak autoryzacji do odczytu logów (HTTP ' + response.status + '). Sprawdź sesję aplikacji i uprawnienia API.');
          }
          return;
        }
        if (!response.ok) throw new Error('HTTP ' + response.status);
        if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('Brak odpowiedzi JSON');
        const parsed = parseSnapshot(await response.json());
        if (!disposed) {
          setSnapshot(parsed);
          setStatus('ready');
          setError('');
          setLastUpdated(new Date().toLocaleTimeString('pl-PL'));
        }
      } catch (cause) {
        if (!disposed && (!controller.signal.aborted || timedOut)) {
          setError(timedOut ? 'Serwer nie odpowiedział w ciągu 8 sekund.' : cause instanceof Error ? cause.message.slice(0, 180) : 'Błąd odczytu logów');
          setStatus('error');
        }
      } finally { window.clearTimeout(timeout); if (active === controller) active = null; }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 9000);
    const onVisible = () => { if (!document.hidden) void poll(); };
    const onWorkspace = (event: Event) => {
      const topic = (event as CustomEvent<{ topic?: string }>).detail?.topic;
      if (['logs', 'terminal', 'agents', 'kernel', 'workspace'].includes(String(topic))) void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('bastilla:workspace-event', onWorkspace);
    return () => {
      disposed = true; active?.abort(); window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('bastilla:workspace-event', onWorkspace);
    };
  }, [enabled, refreshToken, cardVisible]);

  const query = search.trim().toLowerCase();
  const entries = (snapshot?.logs || []).filter(log =>
    (filter === 'all' || log.category === filter) &&
    (!query || (log.source + ' ' + log.message).toLowerCase().includes(query))).slice(0, 60);
  const draft = (log: LogItem) => {
    onPrompt('Do agenta ' + target + ': sprawdź błąd na podstawie logów systemowych Bastilla, bez wykonywania napraw bez zgody operatora. ' +
      JSON.stringify({ time: log.timestamp, level: log.level, source: log.source, message: log.message }));
  };

  return <section ref={cardRef} aria-label="Dynamiczne logi systemowe" className="min-w-0 space-y-3 rounded-xl border border-cyan-800/60 bg-[#071827] p-3 text-slate-100">
    <header className="flex flex-wrap items-center gap-2">
      <FileText size={16} className="text-cyan-300"/>
      <strong className="flex-1 text-sm">Logi serwera · LIVE</strong>
      <span role="status" className={'text-xs ' + (status === 'ready' && enabled ? 'text-emerald-300' : 'text-amber-300')}>
        {!enabled ? 'Wstrzymano' : status === 'ready' ? 'Połączono' : status === 'locked' ? 'Brak dostępu do API' : status === 'error' ? 'Błąd połączenia' : 'Łączenie…'}
      </span>
    </header>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={buttonClass} aria-pressed={enabled} onClick={() => setEnabled(v => !v)}>
        {enabled ? <Pause size={12} className="inline"/> : <Play size={12} className="inline"/>} {enabled ? 'Wstrzymaj' : 'Włącz LIVE'}
      </button>
      <button type="button" className={buttonClass} disabled={!enabled} onClick={() => setRefreshToken(n => n + 1)}>
        <RefreshCw size={12} className="inline"/> Odśwież
      </button>
      <span className="self-center text-[11px] text-slate-400">{lastUpdated ? 'Pomiar: ' + lastUpdated : 'Brak odczytu'}</span>
    </div>
    {error && enabled && <p className="rounded-lg border border-amber-800 p-2 text-xs text-amber-200" role="alert">{error}{snapshot ? ' · Wyświetlane dane mogą być nieaktualne.' : ''}</p>}
    {snapshot && <div className="flex flex-wrap gap-2 text-[11px]">
      <span className="rounded-md bg-slate-900 px-2 py-1">Wszystkie {snapshot.counts.all}</span>
      <span className="rounded-md bg-rose-950/50 px-2 py-1 text-rose-200">Błędy {snapshot.counts.errors}</span>
      <span className="rounded-md bg-emerald-950/50 px-2 py-1 text-emerald-200">Zgłoszone sukcesy {snapshot.counts.success}</span>
      <span className="rounded-md bg-slate-900 px-2 py-1">Info {snapshot.counts.info}</span>
    </div>}
    <div className="flex flex-wrap gap-2">
      {(['all','error','success','info'] as const).map(f => <button type="button" key={f}
        aria-pressed={filter === f} onClick={() => setFilter(f)}
        className={buttonClass + (filter === f ? ' border-cyan-500 bg-cyan-950 text-cyan-100' : '')}>
        {({all:'Wszystkie',error:'Błędy',success:'Sukcesy',info:'Informacje'} as const)[f]}
      </button>)}
    </div>
    <input aria-label="Szukaj w logach" placeholder="Filtruj po treści lub źródle…"
      value={search} onChange={e => setSearch(e.target.value)} maxLength={120}
      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"/>
    <div className="max-h-96 space-y-2 overflow-y-auto" aria-live="off">
      {!snapshot && <p className="p-3 text-xs text-slate-400">Brak potwierdzonych logów. Sprawdź połączenie i uprawnienia API.</p>}
      {snapshot && entries.length === 0 && <p className="p-3 text-xs text-slate-400">Brak wpisów pasujących do filtra.</p>}
      {entries.map((log, index) => {
        const key = log.id + '-' + index;
        return <article key={key} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {log.category === 'error' ? <AlertTriangle size={13} className="text-rose-300"/> :
              log.category === 'success' ? <CheckCircle2 size={13} className="text-emerald-300"/> : <FileText size={13} className="text-slate-400"/>}
            <span className="text-[11px] text-slate-400">{localTime(log.timestamp)}</span>
            <strong className="flex-1 truncate text-[11px] text-cyan-200">{log.source || 'SYSTEM'}</strong>
            <button type="button" className="text-[11px] text-sky-200" aria-expanded={expanded === key}
              onClick={() => setExpanded(v => v === key ? null : key)}>{expanded === key ? 'Zwiń' : 'Szczegóły'}</button>
          </div>
          <p className="mt-1 break-words text-xs text-slate-200">{log.message}</p>
          {expanded === key && <div className="mt-2 space-y-2">
            <p className="text-[10px] text-slate-400">Poziom: {log.level} · ID: {log.id}</p>
            {log.category === 'error' && <button type="button" className={buttonClass} onClick={() => draft(log)}>
              Przygotuj diagnozę
            </button>}
          </div>}
        </article>;
      })}
    </div>
    <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-2 text-xs">
      <label className="flex items-center gap-1 text-slate-300">Agent
        <select value={target} onChange={e => setTarget(e.target.value as Agent)} className="rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-slate-100">
          {(['Aria','Alex','Astyria','Aurelius'] as const).map(name => <option key={name}>{name}</option>)}
        </select>
      </label>
      <span className="text-[10px] text-slate-500">Wyłącznie odczyt · 9 s · bez wpisów do czatu</span>
    </div>
    <p className="text-[10px] text-slate-500">
      Sukces oznacza wpis klasy „healed”, nie niezależnie potwierdzoną naprawę.
      Przycisk diagnozy tworzy szkic, nie wysyła go automatycznie.
    </p>
  </section>;
}
