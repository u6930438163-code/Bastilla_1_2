import React, { useMemo, useState } from 'react';
import { Activity, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Clipboard, Code2, Download, ExternalLink, LoaderCircle, Play, ShieldCheck, TerminalSquare, X } from 'lucide-react';

export type TerminalCardEntry = {
  type: 'input' | 'output' | 'success' | 'error' | 'system' | 'banner';
  text: string;
  time?: string;
};
export type TerminalCardStatus = 'idle' | 'running' | 'success' | 'error';

type TerminalWorkCardProps = {
  title?: string;
  command?: string;
  status?: TerminalCardStatus;
  entries?: TerminalCardEntry[];
  progress?: number | null;
  source?: string;
  onOpenTerminal?: () => void;
  onCommandRequested?: (command: string) => void;
  compact?: boolean;
};

const styles: Record<TerminalCardStatus, { label: string; className: string }> = {
  idle: { label: 'Oczekiwanie', className: 'text-slate-300 border-slate-600 bg-slate-800' },
  running: { label: 'Wykonywanie', className: 'text-sky-200 border-sky-700 bg-sky-950/70' },
  success: { label: 'Wynik odebrany', className: 'text-emerald-200 border-emerald-700 bg-emerald-950/60' },
  error: { label: 'Błąd', className: 'text-rose-200 border-rose-700 bg-rose-950/60' },
};

function short(value: unknown, max: number) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

export function TerminalWorkCard({
  title = 'BASTILLA / TERMINAL',
  command = '',
  status = 'idle',
  entries = [],
  progress = null,
  source = 'Odpowiedź agenta',
  onOpenTerminal,
  onCommandRequested,
  compact = false,
}: TerminalWorkCardProps) {
  const [section, setSection] = useState<'all' | 'errors' | 'system'>('all');
  const [expanded, setExpanded] = useState(true);
  const [draft, setDraft] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [feedback, setFeedback] = useState('');
  const normalizedEntries = useMemo(() => entries.slice(-120).map(entry => ({
    type: entry.type,
    text: short(entry.text, 4000),
    time: short(entry.time, 30),
  })), [entries]);
  const visible = normalizedEntries.filter(entry =>
    section === 'all' || (section === 'errors' ? entry.type === 'error' : entry.type === 'system'));
  const errors = normalizedEntries.filter(entry => entry.type === 'error').length;
  const success = normalizedEntries.filter(entry => entry.type === 'success').length;
  const current = styles[status] ?? styles.idle;
  const actualProgress = typeof progress === 'number' && Number.isFinite(progress)
    ? Math.max(0, Math.min(100, progress)) : null;

  const exportText = () =>
    normalizedEntries.map(entry => '[' + (entry.time || '--') + '][' + entry.type + '] ' + entry.text).join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportText());
      setFeedback('Skopiowano log karty.');
    } catch {
      setFeedback('Schowek jest niedostępny.');
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportText()], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'bastilla-terminal-card.txt';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const submitCommand = (event: React.FormEvent) => {
    event.preventDefault();
    if (!onCommandRequested || status === 'running' || !draft.trim()) return;
    if (!confirm) { setConfirm(true); return; }
    onCommandRequested(draft.trim());
    setDraft('');
    setConfirm(false);
    setFeedback('Przekazano polecenie do istniejącego terminala. Wynik pojawi się po odpowiedzi backendu.');
  };
  return (
    <section className="bastilla-work-terminal-card min-w-0 overflow-hidden rounded-2xl border border-cyan-800/60 bg-[#081725] text-slate-100 shadow-lg shadow-black/15"
      aria-label="Interaktywna karta terminala">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-700/80 px-3 py-2.5 bg-[#10263a]">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-rose-400" />
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
        </div>
        <TerminalSquare className="h-4 w-4 text-cyan-300"/>
        <strong className="flex-1 text-[11px] tracking-wider truncate">{short(title, 110)}</strong>
        <span role="status" className={'rounded-full border px-2 py-0.5 text-[10px] flex items-center gap-1 ' + current.className}>
          {status === 'running' ? <LoaderCircle className="h-3 w-3 animate-spin"/> :
            status === 'error' ? <AlertCircle className="h-3 w-3"/> :
            status === 'success' ? <CheckCircle2 className="h-3 w-3"/> : <Activity className="h-3 w-3"/>}
          {current.label}
        </span>
        <button type="button" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}
          className="p-1.5 rounded text-slate-300 hover:bg-slate-700 hover:text-white" title={expanded ? 'Zwiń kartę' : 'Rozwiń kartę'}>
          {expanded ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}
        </button>
      </header>
      {expanded && <>
        <div className="flex flex-wrap gap-2 items-center justify-between px-3 py-2 text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-cyan-300"/>{short(source, 90)}</span>
          <span>{normalizedEntries.length} wpisów · {success} sukcesów · {errors} błędów</span>
        </div>
        {command && <div className="mx-3 mb-2 rounded-lg border border-sky-900 bg-[#03111f] px-3 py-2 font-mono text-[11px] break-all">
          <span className="text-emerald-300">$</span> {short(command, 1200)}
        </div>}
        {status === 'running' && <div className="mx-3 mb-2" role="status" aria-label={actualProgress !== null ? 'Postęp ' + actualProgress + '%' : 'Oczekiwanie na wynik serwera'}>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
            {actualProgress === null
              ? <div className="h-full w-1/3 animate-pulse rounded-full bg-cyan-400" />
              : <div className="h-full rounded-full bg-cyan-400" style={{ width: actualProgress + '%' }} />}
          </div>
          <p className="mt-1 text-[10px] text-slate-400">{actualProgress === null ? 'Trwa oczekiwanie na odpowiedź; serwer nie podał wartości procentowej.' : 'Postęp zgłoszony przez system: ' + actualProgress + '%'}</p>
        </div>}
        <nav className="flex items-center justify-between gap-2 px-3 py-2 border-y border-slate-800" aria-label="Filtry terminala">
          <div className="flex gap-1 overflow-x-auto" role="group">
            {([
              ['all','Wyjście'],
              ['errors','Błędy'],
              ['system','Zdarzenia'],
            ] as const).map(([key,label]) =>
              <button key={key} type="button" aria-pressed={section===key} onClick={()=>setSection(key)}
                className={'rounded-md px-2.5 py-1 text-[11px] font-semibold transition ' + (section===key ? 'bg-cyan-900 text-cyan-100' : 'text-slate-400 hover:bg-slate-800 hover:text-white')}>
                {label}
              </button>)}
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={() => void copy()} aria-label="Kopiuj logi" title="Kopiuj" className="p-2 text-slate-300 hover:text-cyan-200"><Clipboard className="h-4 w-4"/></button>
            <button type="button" onClick={download} aria-label="Pobierz logi" title="Pobierz log" className="p-2 text-slate-300 hover:text-cyan-200"><Download className="h-4 w-4"/></button>
          </div>
        </nav>
        <div role="log" aria-live={status === 'running' ? 'off' : 'polite'} className={'overflow-auto bg-[#030d18] p-3 font-mono text-[11px] leading-relaxed ' + (compact ? 'max-h-48 min-h-20' : 'max-h-72 min-h-28')}>
          {visible.length ? visible.map((entry, index) => (
            <div key={index} className={'whitespace-pre-wrap break-words py-0.5 ' +
              (entry.type === 'error' ? 'text-rose-300' : entry.type === 'success' ? 'text-emerald-300' :
                entry.type === 'input' ? 'text-sky-200' : entry.type === 'system' ? 'text-amber-200' : 'text-slate-300')}>
              {entry.time && <span className="text-slate-500">[{entry.time}] </span>}{entry.text}
            </div>
          )) : <p className="text-slate-500">{normalizedEntries.length ? 'Brak wpisów w wybranym filtrze.' : 'Brak potwierdzonego wyniku terminala.'}</p>}
        </div>
        {onCommandRequested && <form onSubmit={submitCommand} className="border-t border-slate-800 bg-[#0c2232] p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-emerald-300">$</span>
            <input aria-label="Polecenie terminala" value={draft} maxLength={1500} autoComplete="off" spellCheck={false}
              onChange={event => { setDraft(event.target.value); setConfirm(false); }} placeholder="Wpisz polecenie…"
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-[#03111f] px-3 py-2 text-sm text-white outline-none focus:border-cyan-500" />
            <button type="submit" disabled={!draft.trim() || status === 'running'}
              className={'rounded-lg px-3 py-2 text-xs font-semibold flex items-center gap-1 disabled:opacity-40 ' +
              (confirm ? 'bg-amber-500 text-slate-950' : 'bg-cyan-600 hover:bg-cyan-500 text-white')}>
              {confirm ? <ShieldCheck className="h-4 w-4"/> : <Play className="h-4 w-4"/>}
              {confirm ? 'Potwierdź' : 'Przygotuj'}
            </button>
            {confirm && <button type="button" onClick={() => setConfirm(false)} aria-label="Anuluj polecenie" className="p-2"><X className="h-4 w-4"/></button>}
          </div>
          {confirm && <p className="text-[11px] text-amber-200">Potwierdź wykonanie polecenia. Uprawnienia i ograniczenia określa serwer Bastilla.</p>}
        </form>}
        <footer className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-slate-800 text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><Code2 className="h-3 w-3"/> Wyłącznie potwierdzone wejście/wyjście; bez symulowania wykonania</span>
          {onOpenTerminal && <button type="button" onClick={onOpenTerminal} className="flex items-center gap-1 rounded-lg border border-sky-800 px-2 py-1 text-sky-200 hover:bg-sky-950">
            <ExternalLink className="h-3 w-3"/> Pełny terminal
          </button>}
        </footer>
        {feedback && <p role="status" className="border-t border-slate-800 px-3 py-2 text-[11px] text-cyan-200">{feedback}</p>}
      </>}
    </section>
  );
}
