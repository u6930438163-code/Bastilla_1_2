import React, { useEffect, useState } from 'react';
import { Cpu, Pause, Play, RefreshCw } from 'lucide-react';

type ProcessItem = {
  pid: number; ppid: number; name: string; cpuPercent: number; rssBytes: number; state: string; elapsed: string;
};
type ProcessSnapshot = { available: boolean; processes: ProcessItem[]; sampledAt: string; error: string };
type Sort = 'cpu' | 'ram' | 'pid';
const API = '/api/operations/processes';
const short = (v: unknown, max = 100) => typeof v === 'string' ? v.slice(0, max) : '';
const positive = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
const MB = (v: number) => (v / (1024 ** 2)).toFixed(1) + ' MiB';
function parseSnapshot(value: unknown): ProcessSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Niepoprawny format listy procesów');
  const data = value as Record<string, unknown>;
  if (typeof data.available !== 'boolean') throw new Error('Niepotwierdzona dostępność procesów');
  const processes = Array.isArray(data.processes) ? data.processes : [];
  return {
    available: data.available,
    processes: processes.slice(0, 80).filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === 'object' && !Array.isArray(p))
      .filter(p => Number.isSafeInteger(p.pid) && typeof p.pid === 'number' && p.pid > 0)
      .map(p => ({
        pid: p.pid as number,
        ppid: positive(p.ppid),
        name: short(p.name, 80),
        cpuPercent: positive(p.cpuPercent),
        rssBytes: positive(p.rssBytes),
        state: short(p.state, 15),
        elapsed: short(p.elapsed, 30),
      })),
    sampledAt: short(data.sampledAt, 80),
    error: short(data.error, 180),
  };
}

export function LiveProcessesWorkWidget({
  onPrompt,
}: { onPrompt: (prompt: string) => void }) {
  const [enabled, setEnabled] = useState(true);
  const [snapshot, setSnapshot] = useState<ProcessSnapshot | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'locked' | 'error'>('loading');
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('cpu');
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let active: AbortController | null = null;
    const poll = async () => {
      if (disposed || document.hidden || active) return;
      const controller = new AbortController();
      active = controller;
      try {
        const response = await fetch(API, { credentials: 'same-origin', cache: 'no-store', method: 'GET', signal: controller.signal });
        if ([401, 403, 503].includes(response.status)) {
          if (!disposed) { setState('locked'); setError('Wymagana aktywna sesja operatora lub konfiguracja Bastilla LIVE.'); }
          return;
        }
        if (!response.ok) throw new Error('HTTP ' + response.status);
        if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('Serwer nie zwrócił JSON');
        const data = parseSnapshot(await response.json());
        if (!disposed) { setSnapshot(data); setError(''); setState('ready'); }
      } catch (cause) {
        if (!disposed && !controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message.slice(0, 140) : 'Brak dostępu do procesów');
          setState('error');
        }
      } finally { if (active === controller) active = null; }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 9000);
    const visible = () => { if (!document.hidden) void poll(); };
    document.addEventListener('visibilitychange', visible);
    return () => {
      disposed = true; active?.abort(); window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [enabled, refresh]);

  const query = search.trim().toLowerCase();
  const filtered = (snapshot?.processes || [])
    .filter(p => !query || p.name.toLowerCase().includes(query) || String(p.pid).includes(query))
    .sort((a, b) => sort === 'ram' ? b.rssBytes - a.rssBytes : sort === 'pid' ? a.pid - b.pid : b.cpuPercent - a.cpuPercent)
    .slice(0, 40);
  const selectedItem = (snapshot?.processes || []).find(p => p.pid === selected);
  const onDiagnose = () => {
    if (!selectedItem) return;
    onPrompt('Zdiagnozuj proces na serwerze Bastilla na podstawie potwierdzonego odczytu. Nie zamykaj i nie restartuj go bez zgody operatora: ' +
      JSON.stringify({ pid: selectedItem.pid, name: selectedItem.name, cpuPercent: selectedItem.cpuPercent,
        rssBytes: selectedItem.rssBytes, state: selectedItem.state }));
  };
  const stateText = !enabled ? 'Wstrzymano' : state === 'ready' ? 'Odczyt LIVE' : state === 'locked' ? 'Brak autoryzacji' : state === 'error' ? 'Błąd odczytu' : 'Łączenie…';
  const time = snapshot?.sampledAt && Number.isFinite(Date.parse(snapshot.sampledAt))
    ? new Date(snapshot.sampledAt).toLocaleTimeString('pl-PL') : '—';

  return <section className="min-w-0 space-y-3 rounded-xl border border-cyan-800/60 bg-[#071827] p-3 text-slate-100" aria-label="Procesy serwera na żywo">
    <header className="flex flex-wrap items-center gap-2">
      <Cpu size={16} className="text-cyan-300"/>
      <strong className="flex-1 text-sm">Procesy serwera · LIVE</strong>
      <span role="status" className={'text-xs ' + (enabled && state === 'ready' ? 'text-emerald-300' : 'text-amber-300')}>{stateText}</span>
    </header>
    <div className="flex flex-wrap gap-2">
      <button type="button" aria-pressed={enabled} onClick={() => setEnabled(v => !v)}
        className="rounded-lg border border-sky-800 px-2.5 py-1.5 text-xs text-sky-100">
        {enabled ? <Pause size={12} className="inline"/> : <Play size={12} className="inline"/>} {enabled ? 'Wstrzymaj' : 'Włącz LIVE'}
      </button>
      <button type="button" disabled={!enabled} onClick={() => setRefresh(n => n + 1)}
        className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 disabled:opacity-40">
        <RefreshCw size={12} className="inline"/> Odśwież
      </button>
      <span className="self-center text-[11px] text-slate-400">Odczyt: {time}</span>
    </div>
    {error && enabled && <p role="alert" className="rounded-lg border border-amber-800 p-2 text-xs text-amber-200">
      {error} {snapshot ? 'Dane z poprzedniego odczytu są nieaktualne.' : ''}
    </p>}
    {snapshot?.available === false && <p className="text-xs text-amber-300">{snapshot.error || 'Procesy nie są dostępne na tym serwerze.'}</p>}
    {snapshot?.available && <div className="flex flex-wrap gap-2">
      <input aria-label="Wyszukaj proces" placeholder="Szukaj procesu lub PID…" maxLength={100}
        value={search} onChange={event => setSearch(event.target.value)}
        className="min-w-[120px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"/>
      <label className="flex items-center gap-1 text-xs text-slate-300">Sortuj
        <select value={sort} onChange={event => setSort(event.target.value as Sort)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100">
          <option value="cpu">CPU</option><option value="ram">RAM</option><option value="pid">PID</option>
        </select>
      </label>
    </div>}
    {snapshot?.available ? <div className="max-h-96 overflow-auto rounded-lg border border-slate-800">
      <table className="w-full min-w-[340px] text-left text-[11px]">
        <thead className="sticky top-0 bg-slate-900 text-slate-400"><tr>
          <th className="p-2">PID / proces</th><th className="p-2">CPU</th><th className="p-2">RAM</th><th className="p-2">Stan</th>
        </tr></thead>
        <tbody>{filtered.map(p => <tr key={p.pid} className={'cursor-pointer border-t border-slate-800 ' + (selected === p.pid ? 'bg-cyan-950/60' : 'hover:bg-slate-900/70')}>
          <td className="p-2"><button type="button" className="max-w-[160px] text-left" onClick={() => setSelected(p.pid)}>
            <span className="font-mono text-cyan-200">{p.pid}</span> <span className="break-all">{p.name}</span>
          </button></td>
          <td className="p-2 tabular-nums">{p.cpuPercent.toFixed(1)}%</td>
          <td className="p-2 tabular-nums">{MB(p.rssBytes)}</td>
          <td className="p-2">{p.state}</td>
        </tr>)}</tbody>
      </table>
      {filtered.length === 0 && <p className="p-3 text-xs text-slate-400">Brak procesów spełniających filtr.</p>}
    </div> : <p className="text-xs text-slate-400">{snapshot ? 'Brak dostępnych danych procesów.' : 'Oczekiwanie na dane z autoryzowanego API…'}</p>}
    {selectedItem && <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-2">
      <span className="flex-1 text-[11px] text-slate-300">Wybrany: {selectedItem.name} (PID {selectedItem.pid})</span>
      <button type="button" onClick={onDiagnose} className="rounded-lg border border-cyan-800 px-3 py-2 text-xs text-cyan-100">Przygotuj diagnozę</button>
    </div>}
    <p className="text-[10px] text-slate-500">Widoczne są procesy środowiska serwera (np. kontenera). Podgląd działa tylko po zalogowaniu; nie wysyła poleceń i nie zapisuje nic do czatu.</p>
  </section>;
}
