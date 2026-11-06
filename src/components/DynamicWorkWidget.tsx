import React, { useEffect, useState } from 'react';
import { Activity, Pause, Play, RefreshCw } from 'lucide-react';
import { useLiveCardVisibility } from '../hooks/useLiveCardVisibility';

/**
 * A deliberately allowlisted, read-only data binding for bastilla-ui cards.
 * Agent-produced JSON cannot select a URL, run a command or send a request body.
 */
type RecordData = Record<string, unknown>;
type Field = 'cpuPercent' | 'ramPercent';
type LiveSpec = { source: 'system_metrics'; field: Field; intervalMs: number };
type Sample = { at: number; value: number };

export function getLiveWorkSpec(block: RecordData): LiveSpec | null {
  const live = block.live;
  if (!live || typeof live !== 'object' || Array.isArray(live)) return null;
  const config = live as RecordData;
  if (config.source !== 'system_metrics') return null;
  if (config.field !== 'cpuPercent' && config.field !== 'ramPercent') return null;
  const type = String(block.type);
  if (!['metric', 'chart', 'progress', 'table'].includes(type)) return null;
  const requested = typeof config.intervalMs === 'number' && Number.isFinite(config.intervalMs)
    ? config.intervalMs : 5000;
  return {
    source: 'system_metrics',
    field: config.field,
    intervalMs: Math.min(30000, Math.max(2000, Math.round(requested))),
  };
}

function readPercent(value: unknown, field: Field): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as RecordData;
  let percent: number | null = null;
  if (field === 'cpuPercent') {
    percent = typeof data.cpuPercent === 'number' ? data.cpuPercent : null;
  } else if (typeof data.ramUsedBytes === 'number' && typeof data.ramTotalBytes === 'number' && data.ramTotalBytes > 0) {
    percent = data.ramUsedBytes / data.ramTotalBytes * 100;
  }
  return percent !== null && Number.isFinite(percent)
    ? Math.min(100, Math.max(0, percent)) : null;
}

function applyLiveValue(block: RecordData, samples: Sample[], field: Field): RecordData {
  const last = samples[samples.length - 1];
  const name = field === 'cpuPercent' ? 'CPU serwera' : 'RAM serwera';
  const pct = last.value.toFixed(1);
  const suffix = 'Rzeczywiste dane hosta serwera Bastilla, nie urządzenia użytkownika.';
  if (block.type === 'metric') return {
    ...block, label: name, value: pct + '%', detail: suffix,
  };
  if (block.type === 'progress') return {
    ...block, title: name + ' · LIVE', value: last.value, description: suffix,
  };
  if (block.type === 'chart') {
    const chartSamples = samples.length === 1 ? [samples[0], samples[0]] : samples;
    return {
      ...block, title: name + ' · LIVE',
      chart: block.chart === 'bar' ? 'bar' : 'line',
      labels: chartSamples.map(item => new Date(item.at).toLocaleTimeString('pl-PL')),
      values: chartSamples.map(item => item.value),
      unit: '%', caption: suffix + ' Ostatnie ' + samples.length + ' pomiarów.',
    };
  }
  return {
    ...block, columns: ['Godzina', name],
    rows: samples.slice().reverse().map(item => [
      new Date(item.at).toLocaleTimeString('pl-PL'), item.value.toFixed(1) + '%',
    ]),
  };
}

export function DynamicWorkWidget({
  block, render,
}: {
  block: RecordData;
  render: (data: RecordData) => React.ReactNode;
}) {
  const spec = getLiveWorkSpec(block);
  const { cardRef, cardVisible } = useLiveCardVisibility<HTMLElement>();
  const [enabled, setEnabled] = useState(true);
  const [field, setField] = useState<Field>(spec?.field ?? 'cpuPercent');
  const [samples, setSamples] = useState<Sample[]>([]);
  const [status, setStatus] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [error, setError] = useState('');
  const [refreshIndex, setRefreshIndex] = useState(0);
  const intervalMs = spec?.intervalMs ?? 5000;

  useEffect(() => {
    if (!enabled || !spec || !cardVisible) return;
    let disposed = false;
    let controller: AbortController | null = null;
    const poll = async () => {
      if (disposed || document.hidden || controller) return;
      const current = new AbortController();
      controller = current;
      let timedOut = false;
      const timeout = window.setTimeout(() => { timedOut = true; current.abort(); }, 8000);
      try {
        const response = await fetch('/api/system/metrics', {
          method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: current.signal,
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('Brak odpowiedzi JSON');
        const payload: unknown = await response.json();
        const percent = readPercent(payload, field);
        if (percent === null) throw new Error('Brak wiarygodnego odczytu ' + (field === 'cpuPercent' ? 'CPU' : 'RAM'));
        if (disposed) return;
        setSamples(prev => [...prev, { at: Date.now(), value: percent }].slice(-24));
        setStatus('live');
        setError('');
      } catch (cause) {
        if (disposed || (current.signal.aborted && !timedOut)) return;
        setStatus('error');
        setError(timedOut ? 'Serwer nie odpowiedział w ciągu 8 sekund.' : cause instanceof Error ? cause.message.slice(0, 150) : 'Brak połączenia z serwerem');
      } finally {
        window.clearTimeout(timeout);
        if (controller === current) controller = null;
      }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, intervalMs);
    const onVisible = () => { if (!document.hidden) void poll(); };
    const onWorkspace = (event: Event) => {
      const topic = (event as CustomEvent<{topic?: string}>).detail?.topic;
      if (topic === 'system' || topic === 'telemetry') void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('bastilla:workspace-event', onWorkspace);
    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('bastilla:workspace-event', onWorkspace);
    };
  }, [enabled, field, intervalMs, refreshIndex, spec?.source, cardVisible]);

  if (!spec) return <>{render(block)}</>;
  const hasData = samples.length > 0;
  // Pause freezes the last verified measurement rather than reverting to a mock value.
  const currentBlock = hasData ? applyLiveValue(block, samples, field) : block;
  const label = !enabled ? 'Wstrzymano · ostatni pomiar' : status === 'live' ? 'LIVE · dane serwera' :
    status === 'error' ? 'Offline / nieaktualne' : 'Łączenie…';
  return <section ref={cardRef} className="min-w-0 space-y-2 rounded-xl border border-sky-800/60 bg-slate-950/30 p-2" aria-label="Dynamiczny element czatu">
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <span className={'inline-flex items-center gap-1 font-semibold ' + (enabled && status === 'live' ? 'text-emerald-300' : 'text-slate-300')}>
        <Activity size={13} /> {label}
      </span>
      <div className="flex-1" />
      <label className="flex items-center gap-1 text-slate-300">
        Odczyt
        <select aria-label="Parametr dynamiczny" value={field}
          onChange={event => { setField(event.target.value as Field); setSamples([]); setStatus('connecting'); }}
          className="rounded-md border border-slate-700 bg-[#101d2e] px-2 py-1 text-slate-100">
          <option value="cpuPercent">CPU</option>
          <option value="ramPercent">RAM</option>
        </select>
      </label>
      <button type="button" onClick={() => setEnabled(value => !value)}
        aria-pressed={enabled}
        className="flex items-center gap-1 rounded-md border border-sky-800 px-2 py-1 text-sky-100 hover:bg-sky-950">
        {enabled ? <Pause size={13}/> : <Play size={13}/>}
        {enabled ? 'Wstrzymaj LIVE' : 'Włącz LIVE'}
      </button>
      <button type="button" disabled={!enabled}
        onClick={() => setRefreshIndex(value => value + 1)}
        className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-slate-200 hover:bg-slate-800 disabled:opacity-40">
        <RefreshCw size={13}/> Odśwież
      </button>
    </div>
    {enabled && status === 'error' && <p role="status" className="text-xs text-amber-300">
      {hasData ? 'Ostatnie dane nie są już aktualne. ' : 'Nie można pobrać danych. '}
      {error}
    </p>}
    {!hasData ? <p role="status" className="p-3 text-xs text-slate-300">
      {!enabled ? 'Brak wcześniejszego pomiaru. Włącz LIVE, aby pobrać dane.' : status === 'error' ? 'Brak pomiarów z backendu; nie pokazuję fikcyjnych wartości.' : 'Oczekiwanie na odczyt z serwera…'}
    </p> : render(currentBlock)}
    <p className="text-[10px] text-slate-500">
      {enabled && hasData ? 'Ostatni pomiar: ' + new Date(samples[samples.length - 1].at).toLocaleTimeString('pl-PL') +
        ' · odświeżanie co ' + (intervalMs / 1000) + ' s' :
        enabled ? 'Źródło: /api/system/metrics · tylko odczyt' : hasData ? 'Wstrzymano odświeżanie · ostatni zweryfikowany pomiar' : 'Oczekiwanie na pierwszy pomiar'}
    </p>
  </section>;
}
