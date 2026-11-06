import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, BarChart3, Bot, CheckCircle2, Cpu, Database, RefreshCw, Server } from 'lucide-react';

type Process = { pid: number; name: string; cpuPercent: number; rssBytes: number; state: string };
type ProcessResponse = { available?: boolean; processes?: Process[]; sampledAt?: string; error?: string };
type Log = { id: string; message: string; category: 'success' | 'error' | 'info'; source: string; timestamp: string };
type LogResponse = { logs?: Log[]; counts?: { all: number; errors: number; success: number; info: number } };
type OllamaResponse = { connected?: boolean; configuredModel?: string; modelLoaded?: boolean | null; runningModels?: Array<{name:string}> | null; error?: string };

const REFRESH_MS = 12000;
const fmtBytes = (n: number) => Number.isFinite(n) ? (n / (1024 * 1024)).toFixed(1) + ' MiB' : '—';
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : 0;

/** Read-only widgets, using Bastilla's existing authenticated diagnostics API. */
export function TerminalAnalyticsPanel() {
  const [processes, setProcesses] = useState<ProcessResponse | null>(null);
  const [logs, setLogs] = useState<LogResponse | null>(null);
  const [ollama, setOllama] = useState<OllamaResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState<'processes' | 'logs' | 'models'>('processes');

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      if (document.hidden) return;
      try {
        const paths = ['/api/operations/processes', '/api/operations/logs?filter=all', '/api/operations/ollama'];
        const responses = await Promise.all(paths.map(url =>
          fetch(url, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })));
        if (responses.some(r => r.status === 401 || r.status === 403)) {
          setError('Wymagana autoryzacja operatora. Zaloguj się w Menedżerze zadań.');
          return;
        }
        if (responses.some(r => !r.ok)) throw new Error('Serwer nie udostępnia kompletnych danych diagnostycznych.');
        const [processPayload, logPayload, modelPayload] = await Promise.all(responses.map(r => r.json()));
        if (controller.signal.aborted) return;
        setProcesses(processPayload as ProcessResponse);
        setLogs(logPayload as LogResponse);
        setOllama(modelPayload as OllamaResponse);
        setError('');
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Błąd diagnostyki.');
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, REFRESH_MS);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [refreshKey]);

  const top = useMemo(() => (processes?.processes || []).filter(p => Number.isFinite(p.cpuPercent))
    .slice().sort((a,b) => b.cpuPercent - a.cpuPercent).slice(0, 7), [processes]);
  const maxCpu = Math.max(1, ...top.map(x => number(x.cpuPercent)));
  const counts = logs?.counts;
  const recent = (logs?.logs || []).slice(0, 12);
  const hasData = Boolean(processes || logs || ollama);

  return <section className="rounded-xl border border-cyan-900/70 bg-[#081725] overflow-hidden text-slate-200" aria-label="Panel danych systemowych">
    <header className="flex flex-wrap gap-2 items-center justify-between border-b border-slate-800 bg-[#10263a] px-3 py-2.5">
      <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-cyan-300"/><strong className="text-xs">DIAGNOSTYKA · dane serwera</strong></div>
      <button type="button" onClick={()=>{setBusy(true);setRefreshKey(x=>x+1)}} disabled={busy}
        className="flex items-center gap-1 text-[11px] text-cyan-200 disabled:opacity-40">
        <RefreshCw className={'h-3.5 w-3.5 ' + (busy ? 'animate-spin' : '')}/> Odśwież
      </button>
    </header>
    {error && <p role="alert" className="m-3 rounded-lg border border-amber-900 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">{error}</p>}
    {busy && !hasData && <div role="status" className="flex items-center gap-2 px-3 py-4 text-xs text-slate-400"><RefreshCw className="h-4 w-4 animate-spin"/> Pobieranie danych…</div>}
    {hasData && <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3">
        {[
          { label:'Procesy', value:processes?.available ? String(processes.processes?.length ?? 0) : '—', icon:Cpu },
          { label:'Sukcesy w logach', value:counts ? String(counts.success) : '—', icon:CheckCircle2 },
          { label:'Błędy w logach', value:counts ? String(counts.errors) : '—', icon:AlertCircle },
          { label:'Ollama', value:ollama?.connected ? 'API online' : ollama ? 'Brak połączenia' : '—', icon:Server },
        ].map(m=><div key={m.label} className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
          <div className="flex gap-1.5 items-center text-[10px] text-slate-400"><m.icon className="h-3.5 w-3.5 text-cyan-300"/>{m.label}</div>
          <strong className="block mt-1 text-sm text-white break-words">{m.value}</strong>
        </div>)}
      </div>
      <div role="tablist" className="flex gap-1 border-y border-slate-800 px-3 py-2">
        {([
          ['processes','Wykres procesów',BarChart3],['logs','Logi',Database],['models','Modele',Bot],
        ] as const).map(([id,label,Icon])=>
          <button key={id} type="button" role="tab" aria-selected={tab===id} onClick={()=>setTab(id)}
            className={'flex gap-1 items-center px-3 py-1.5 rounded-lg text-[11px] ' + (tab===id ? 'bg-cyan-900 text-white' : 'text-slate-400 hover:bg-slate-800')}>
            <Icon className="h-3.5 w-3.5"/>{label}
          </button>)}
      </div>
      <div className="p-3 space-y-2">
        {tab==='processes' && (processes?.available && top.length ? top.map(p=>
          <div key={p.pid} className="space-y-1">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="flex-1 truncate text-slate-300">{p.name} <span className="text-slate-500">#{p.pid}</span></span>
              <span className="font-mono text-cyan-300">{p.cpuPercent.toFixed(1)}%</span>
              <span className="text-slate-400">{fmtBytes(p.rssBytes)}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden" role="meter"
              aria-label={'CPU procesu ' + p.name} aria-valuenow={Math.min(100,Math.max(0,p.cpuPercent))} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-cyan-500 rounded-full" style={{width:Math.max(1,Math.min(100,number(p.cpuPercent) / maxCpu * 100))+'%'}}/>
            </div>
          </div>) : <p className="text-xs text-slate-400">{processes?.error || 'Brak potwierdzonej listy procesów.'}</p>)}
        {tab==='logs' && (recent.length ? recent.map((l,i)=>
          <div key={l.id || i} className="flex gap-2 items-start rounded-lg border border-slate-800 bg-slate-900/40 p-2 text-[11px]">
            {l.category==='error'?<AlertCircle className="w-3.5 h-3.5 text-rose-300 shrink-0"/>:l.category==='success'?<CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 shrink-0"/>:<Activity className="w-3.5 h-3.5 text-slate-400 shrink-0"/>}
            <div className="min-w-0"><span className="text-slate-500">{l.source} · {l.timestamp}</span><p className="break-words whitespace-pre-wrap">{l.message}</p></div>
          </div>) : <p className="text-xs text-slate-400">Brak logów z serwera.</p>)}
        {tab==='models' && <div className="text-xs space-y-2">
          <p>API Ollama: <strong className={ollama?.connected?'text-emerald-300':'text-amber-300'}>{ollama?.connected?'Odpowiada':'Niepotwierdzone'}</strong></p>
          <p>Model skonfigurowany: <strong>{ollama?.configuredModel || 'nieznany'}</strong></p>
          <p>Model w pamięci: <strong>{ollama?.modelLoaded===true?'Tak':ollama?.modelLoaded===false?'Nie':'Brak danych'}</strong></p>
          <p>Uruchomione: {(ollama?.runningModels?.map(x=>x.name).join(', ')) || 'brak potwierdzenia'}</p>
          {ollama?.error && <p className="text-rose-200">{ollama.error}</p>}
        </div>}
      </div>
      <p className="border-t border-slate-800 px-3 py-2 text-[10px] text-slate-500">Odczyt co 12 sekund · obciążenie procesów jest względne · żadne dane nie są generowane na potrzeby widoku.</p>
    </>}
  </section>;
}
