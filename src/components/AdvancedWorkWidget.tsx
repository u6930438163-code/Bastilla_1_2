import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, ClipboardCopy, ListChecks, ShieldCheck, Sparkles } from 'lucide-react';

/**
 * Sandboxed, declarative UI blocks supplied by agents. They only render data.
 * All actions populate the main-chat draft; nothing executes automatically.
 */
export type AdvancedBlock = Record<string, unknown>;
type Props = { block: AdvancedBlock; onPrompt: (prompt: string) => void };

const s = (value: unknown, max = 200) => typeof value === 'string' ? value.slice(0, max) : '';
const bounded = (value: unknown, max = 100) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
};
const records = (value: unknown, max = 12): AdvancedBlock[] =>
  Array.isArray(value) ? value.slice(0, max).filter((entry): entry is AdvancedBlock =>
    Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)) : [];

const surface = 'rounded-xl border border-slate-700 bg-[#081725] p-3 text-slate-100';
const buttonStyle = 'rounded-lg border border-cyan-700 bg-cyan-950 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-900 disabled:opacity-40';

function ProgressWidget({ block }: { block: AdvancedBlock }) {
  const value = bounded(block.value);
  const color = block.status === 'error' ? 'bg-rose-500'
    : block.status === 'success' ? 'bg-emerald-500' : 'bg-cyan-400';
  return <section className={surface} aria-label={s(block.label) || 'Postęp zadania'}>
    <div className="flex items-center justify-between gap-3 text-sm">
      <strong className="truncate">{s(block.label, 110) || 'Postęp'}</strong>
      <span className="tabular-nums text-cyan-200">{Math.round(value)}%</span>
    </div>
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}
      aria-label={s(block.label, 110) || 'Postęp'} className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-700">
      <div className={'h-full rounded-full transition-all ' + color} style={{ width: String(value) + '%' }} />
    </div>
    {s(block.detail, 400) && <p className="mt-2 text-xs text-slate-300">{s(block.detail, 400)}</p>}
    <p className="mt-1 text-[10px] text-slate-500">Wartość deklarowana w wiadomości agenta; nie jest automatycznym pomiarem.</p>
  </section>;
}

function AlertWidget({ block, onPrompt }: Props) {
  const tone = s(block.tone, 20);
  const style = tone === 'error' ? 'border-rose-700 bg-rose-950/30 text-rose-100' :
    tone === 'warning' ? 'border-amber-700 bg-amber-950/30 text-amber-100' :
    tone === 'success' ? 'border-emerald-700 bg-emerald-950/30 text-emerald-100' :
    'border-sky-800 bg-sky-950/30 text-sky-100';
  const prompt = s(block.prompt, 2000);
  return <section role={tone === 'error' ? 'alert' : 'status'} className={'rounded-xl border p-3 ' + style}>
    <strong className="flex items-center gap-2 text-sm">{tone === 'success' ? <CheckCircle2 size={16}/> : <AlertTriangle size={16}/>}
      {s(block.title, 120) || 'Komunikat agenta'}</strong>
    <p className="mt-1 whitespace-pre-wrap text-xs">{s(block.message, 1500)}</p>
    {prompt && <button type="button" className={'mt-3 ' + buttonStyle} onClick={() => onPrompt(prompt)}>
      {s(block.actionLabel, 80) || 'Przygotuj odpowiedź'}
    </button>}
  </section>;
}

function TimelineWidget({ block }: { block: AdvancedBlock }) {
  const steps = records(block.steps, 20);
  const stateColor = (v: unknown) => v === 'done' ? 'text-emerald-400' : v === 'error' ? 'text-rose-400' : v === 'running' ? 'text-cyan-300' : 'text-slate-500';
  return <section className={surface}>
    <strong className="text-sm">{s(block.title, 120) || 'Przebieg zadania'}</strong>
    <ol className="mt-3 space-y-3">
      {steps.map((step, i) => <li key={i} className="flex gap-2">
        <div className={'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs ' + stateColor(step.status)}>{i + 1}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">{s(step.title, 180) || 'Etap ' + String(i + 1)}</p>
          {s(step.detail, 500) && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-400">{s(step.detail, 500)}</p>}
        </div>
        <span className={'shrink-0 text-[10px] uppercase ' + stateColor(step.status)}>{s(step.status, 16) || 'pending'}</span>
      </li>)}
    </ol>
    <p className="mt-2 text-[10px] text-slate-500">Statusy według odpowiedzi agenta; weryfikuj je w logach backendu.</p>
  </section>;
}

function AccordionWidget({ block }: { block: AdvancedBlock }) {
  const [open, setOpen] = useState<number | null>(0);
  const items = records(block.items, 12);
  return <section className={surface}>
    <strong className="text-sm">{s(block.title, 120) || 'Szczegóły raportu'}</strong>
    <div className="mt-2 divide-y divide-slate-800">
      {items.map((item, i) => <div key={i}>
        <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}
          className="flex w-full items-center justify-between gap-2 py-3 text-left text-xs font-semibold text-cyan-100">
          {s(item.title, 130) || 'Sekcja'}{open === i ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
        </button>
        {open === i && <pre className="pb-3 whitespace-pre-wrap break-words font-sans text-xs text-slate-300">{s(item.content, 5000)}</pre>}
      </div>)}
    </div>
  </section>;
}

function TabsWidget({ block }: { block: AdvancedBlock }) {
  const [active, setActive] = useState(0);
  const items = records(block.tabs, 8);
  const index = Math.min(active, Math.max(0, items.length - 1));
  return <section className={surface}>
    <strong className="text-sm">{s(block.title, 120) || 'Panel szczegółów'}</strong>
    <div role="tablist" className="mt-3 flex flex-wrap gap-1.5">
      {items.map((item, i) => <button type="button" role="tab" aria-selected={index === i}
        key={i} onClick={() => setActive(i)}
        className={index === i ? buttonStyle : 'rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300'}>
        {s(item.label, 50) || 'Karta ' + String(i + 1)}
      </button>)}
    </div>
    {items[index] && <div role="tabpanel" className="mt-3 whitespace-pre-wrap break-words text-xs text-slate-300">{s(items[index].content, 5000)}</div>}
  </section>;
}

function ChecklistWidget({ block, onPrompt }: Props) {
  const items = records(block.items, 20);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const selected = items.filter((_, i) => checked[i]);
  return <section className={surface}>
    <strong className="flex gap-2 text-sm"><ListChecks size={16}/>{s(block.title, 120) || 'Lista kontrolna'}</strong>
    <div className="mt-3 space-y-2">
      {items.map((item, i) => <label key={i} className="flex cursor-pointer items-start gap-2 text-xs">
        <input type="checkbox" checked={Boolean(checked[i])} onChange={(event) => setChecked(old => ({ ...old, [i]: event.target.checked }))}
          className="mt-0.5 accent-cyan-400"/>
        <span className={checked[i] ? 'text-emerald-200' : 'text-slate-200'}>{s(item.label, 200)}</span>
      </label>)}
    </div>
    <button type="button" disabled={selected.length === 0} className={'mt-3 ' + buttonStyle}
      onClick={() => onPrompt((s(block.prompt, 1000) || 'Przeanalizuj wybrane pozycje:') + '\n' + selected.map(item => '- ' + s(item.label, 200)).join('\n'))}>
      Przygotuj polecenie ({selected.length})
    </button>
  </section>;
}

function FormWidget({ block, onPrompt }: Props) {
  const fields = records(block.fields, 8);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const optionsFor = (field: AdvancedBlock) => Array.isArray(field.options) ? field.options.slice(0, 12).map(v => s(v, 100)).filter(Boolean) : [];
  const change = (key: string, value: string | boolean) => setValues(old => ({ ...old, [key]: value }));
  const prompt = s(block.prompt, 2000);
  return <form className={surface} onSubmit={event => {
    event.preventDefault();
    const lines = fields.map((field, i) => {
      const key = String(i);
      const label = s(field.label, 90) || 'Pole ' + String(i + 1);
      const value = values[key] ?? (field.type === 'checkbox' ? false : field.type === 'select' ? (optionsFor(field)[0] || '') : '');
      return label + ': ' + String(value).slice(0, 600);
    });
    onPrompt([prompt || 'Przeanalizuj poniższe dane formularza:', ...lines].join('\n'));
  }}>
    <strong className="flex items-center gap-2 text-sm"><Sparkles size={16}/>{s(block.title, 120) || 'Formularz od agenta'}</strong>
    <p className="mt-1 text-[10px] text-slate-400">Formularz przygotowuje wiadomość do czatu. Nie wysyła danych automatycznie.</p>
    <div className="mt-3 space-y-3">
      {fields.map((field, i) => {
        const key = String(i);
        const fieldType = s(field.type, 20);
        const options = optionsFor(field);
        return <label className="flex flex-col gap-1 text-xs" key={i}>
          <span className="text-slate-300">{s(field.label, 90) || 'Pole ' + String(i + 1)}</span>
          {fieldType === 'checkbox'
            ? <input type="checkbox" className="self-start accent-cyan-400" checked={Boolean(values[key])}
                onChange={e => change(key, e.target.checked)}/>
            : fieldType === 'select'
              ? <select className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-100" value={String(values[key] ?? (options[0] || ''))} onChange={e => change(key, e.target.value)}>
                  {options.map((option, j) => <option key={j} value={option}>{option}</option>)}
                </select>
              : <input type="text" maxLength={600} value={String(values[key] ?? '')}
                  placeholder={s(field.placeholder, 100)} onChange={e => change(key, e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-100"/>}
        </label>;
      })}
    </div>
    <button type="submit" className={'mt-4 ' + buttonStyle}>{s(block.submitLabel, 90) || 'Przygotuj wiadomość'}</button>
  </form>;
}

function CodeWidget({ block }: { block: AdvancedBlock }) {
  const code = s(block.code, 12000);
  const [copied, setCopied] = useState(false);
  return <section className={surface}>
    <div className="mb-2 flex justify-between gap-2 text-xs"><strong>{s(block.title, 100) || 'Kod agenta'}</strong><span>{s(block.language, 30)}</span></div>
    <pre className="max-h-96 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-cyan-100"><code>{code}</code></pre>
    <button type="button" className={'mt-2 flex items-center gap-2 ' + buttonStyle} onClick={() => {
      void navigator.clipboard?.writeText(code).then(() => setCopied(true)).catch(() => setCopied(false));
    }}><ClipboardCopy size={14}/>{copied ? 'Skopiowano' : 'Kopiuj kod'}</button>
    <p className="mt-1 text-[10px] text-slate-500">Kod nie jest wykonywany automatycznie.</p>
  </section>;
}

function AgentHandoffWidget({ block, onPrompt }: Props) {
  const prompt = s(block.prompt, 3000);
  const names = ['Aria', 'Alex', 'Astyria', 'Aurelius'];
  const [agent, setAgent] = useState('Alex');
  return <section className={surface}>
    <strong className="flex gap-2 text-sm"><ShieldCheck size={16}/>{s(block.title, 120) || 'Przekaż zadanie agentowi'}</strong>
    <p className="mt-2 text-xs text-slate-300">{s(block.description, 500)}</p>
    <label className="mt-3 flex flex-col gap-1 text-xs text-slate-300">Wybierz agenta
      <select value={agent} onChange={e => setAgent(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-100">
        {names.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
    </label>
    <button type="button" disabled={!prompt} className={'mt-3 ' + buttonStyle} onClick={() => onPrompt('Do agenta ' + agent + ':\n' + prompt)}>
      Zleć agentowi
    </button>
    <p className="mt-1 text-[10px] text-slate-500">Wybór agenta trafia do zlecenia. Dalsze działania zmieniające system wymagają zgody.</p>
  </section>;
}


/** Read-only technical views: copying does not call any endpoint or execute a shell command. */
function TechnicalWidget({ block }: { block: AdvancedBlock }) {
  const [mode, setMode] = useState<'request' | 'curl' | 'response'>('request');
  const [copied, setCopied] = useState(false);
  const kind = String(block.type);
  const method = s(block.method, 12).toUpperCase().replace(/[^A-Z]/g, '') || 'GET';
  const url = s(block.url, 2000).replace(/[\r\n]/g, '');
  const body = typeof block.body === 'string' ? s(block.body, 12000)
    : block.body == null ? '' : JSON.stringify(block.body, null, 2).slice(0, 12000);
  const sourceHeaders = block.headers && typeof block.headers === 'object' && !Array.isArray(block.headers)
    ? Object.entries(block.headers).slice(0, 20).filter(([key, value]) => typeof value === 'string' && key.length <= 100)
    : [];
  const shell = (part: string) => "'" + part.replace(/'/g, "'\\''") + "'";
  const command = s(block.command, 12000) || [
    'curl', '-X', method, ...sourceHeaders.flatMap(([k,v]) => ['-H', shell(k.replace(/[\r\n]/g, '') + ': ' + String(v).replace(/[\r\n]/g, ''))]),
    ...(body ? ['--data-raw', shell(body)] : []), shell(url || 'https://example.invalid'),
  ].join(' ');
  const response = typeof block.response === 'string' ? s(block.response, 16000)
    : block.response === undefined ? '' : JSON.stringify(block.response, null, 2).slice(0, 16000);
  const json = typeof block.data === 'string' ? s(block.data, 16000) : JSON.stringify(block.data ?? block.body ?? {}, null, 2).slice(0, 16000);
  const lines = s(block.diff, 18000).split('\n').slice(0, 350);
  const logEntries = records(block.entries, 100);
  const [filter, setFilter] = useState('all');
  const selectedLogs = logEntries.filter(entry => filter === 'all' || s(entry.level, 20).toLowerCase() === filter);
  const display = kind === 'curl' || kind === 'http'
    ? mode === 'curl' ? command : mode === 'response' ? response : [method + ' ' + url, ...sourceHeaders.map(([k,v])=> k + ': ' + v), '', body].join('\n')
    : kind === 'json' ? json : kind === 'diff' ? lines.join('\n') : selectedLogs.map(entry => '[' + s(entry.level, 12) + '] ' + s(entry.text, 2500)).join('\n');
  const copy = () => { void navigator.clipboard?.writeText(display).then(() => setCopied(true)).catch(() => setCopied(false)); };
  return <section className={surface} aria-label={'Formatowanie: ' + kind}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <strong className="text-sm">{s(block.title, 100) || ({ curl: 'cURL / HTTP', http: 'HTTP request', json: 'JSON', diff: 'Zmiany plików', logs: 'Logi' } as Record<string,string>)[kind] || 'Dane techniczne'}</strong>
      <button type="button" onClick={copy} className={buttonStyle}>{copied ? 'Skopiowano' : 'Kopiuj'}</button>
    </div>
    {(kind === 'curl' || kind === 'http') && <div role="tablist" className="my-3 flex gap-1.5">
      {(['request','curl','response'] as const).map(tab => <button key={tab} type="button" role="tab" aria-selected={mode === tab}
        onClick={() => { setMode(tab); setCopied(false); }}
        className={mode === tab ? buttonStyle : 'rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400'}>
        {tab === 'request' ? 'Żądanie' : tab === 'curl' ? 'cURL' : 'Odpowiedź'}
      </button>)}
    </div>}
    {kind === 'logs' && <div className="my-3 flex flex-wrap gap-1.5">{['all','success','error','warn','info'].map(key =>
      <button type="button" key={key} onClick={() => setFilter(key)} aria-pressed={filter === key}
        className={filter === key ? buttonStyle : 'rounded-lg border border-slate-700 px-2 py-1.5 text-xs text-slate-400'}>
        {key === 'all' ? 'Wszystkie' : key === 'error' ? 'Błędy' : key === 'success' ? 'Sukcesy' : key}
      </button>)}</div>}
    <pre className="mt-3 max-h-[420px] overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-[11px] leading-relaxed text-sky-100 whitespace-pre-wrap break-all"><code>
      {kind === 'diff' ? lines.map((line,i) => <span key={i} className={'block ' + (line.startsWith('+') ? 'text-emerald-300' : line.startsWith('-') ? 'text-rose-300' : line.startsWith('@@') ? 'text-amber-300' : 'text-slate-300')}>{line}</span>) : display || 'Brak danych do wyświetlenia.'}
    </code></pre>
    <p className="mt-2 text-[10px] text-slate-500">Dane od agenta — niezweryfikowane. Kopiowanie nie wykonuje poleceń. Nie umieszczaj haseł ani tokenów w blokach cURL.</p>
  </section>;
}

export function AdvancedWorkWidget({ block, onPrompt }: Props): React.ReactElement | null {
  switch (block.type) {
    case 'progress': return <ProgressWidget block={block}/>;
    case 'alert': return <AlertWidget block={block} onPrompt={onPrompt}/>;
    case 'timeline': return <TimelineWidget block={block}/>;
    case 'accordion': return <AccordionWidget block={block}/>;
    case 'tabs': return <TabsWidget block={block}/>;
    case 'checklist': return <ChecklistWidget block={block} onPrompt={onPrompt}/>;
    case 'form': return <FormWidget block={block} onPrompt={onPrompt}/>;
    case 'code': return <CodeWidget block={block}/>;
    case 'handoff': return <AgentHandoffWidget block={block} onPrompt={onPrompt}/>;
    case 'curl': case 'http': case 'json': case 'diff': case 'logs': return <TechnicalWidget block={block}/>;
    default: return null;
  }
}
