import React, { useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp, Clapperboard, Code2, Copy, Image as ImageIcon, Play, Sparkles } from 'lucide-react';
import { FormattedMessage } from './FormattedMessage';
import { AdvancedWorkWidget } from './AdvancedWorkWidget';
import { TerminalWorkCard, type TerminalCardEntry, type TerminalCardStatus } from './TerminalWorkCard';
import { ProgressWorkWidget, StepsWorkWidget, FileExplorerWorkWidget, ModelSettingsWorkWidget, ThreeDWorkWidget, PdfWorkWidget } from './AdvancedWorkWidgets';

type WorkBlock = Record<string, unknown>;
type WorkPayload = { title?: string; blocks?: WorkBlock[] };
type WorkChatMessageProps = { content: string; onPrompt: (prompt: string) => void; onOpenTerminal?: () => void };

const MAX_BLOCKS = 12;

function safeSource(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch { /* Not a supported source. */ }
  return null;
}

function youtubeEmbed(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    let id = '';
    if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
      else if (url.pathname.startsWith('/embed/')) id = url.pathname.split('/')[2];
      else if (url.pathname.startsWith('/shorts/')) id = url.pathname.split('/')[2];
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? 'https://www.youtube-nocookie.com/embed/' + id : null;
  } catch { return null; }
}

function text(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function Chart({ block }: { block: WorkBlock }) {
  const labels = Array.isArray(block.labels) ? block.labels.slice(0, 30).map((item) => String(item).slice(0, 18)) : [];
  const raw = Array.isArray(block.values) ? block.values.slice(0, 30) : [];
  const values = raw.map((item) => typeof item === 'number' ? item : Number(item));
  if (labels.length < 2 || labels.length !== values.length || values.some((v) => !Number.isFinite(v))) {
    return <p className="text-xs text-amber-300">Brak prawidłowych danych do wykresu.</p>;
  }
  const width = 560, height = 215, left = 38, right = 14, top = 20, bottom = 38;
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const scale = max - min || 1;
  const x = (i: number) => left + i * (width - left - right) / Math.max(1, values.length - 1);
  const y = (v: number) => top + (max - v) / scale * (height - top - bottom);
  const unit = text(block.unit, 8);
  const bar = block.chart === 'bar';
  const coords = values.map((v, i) => String(x(i)) + ',' + String(y(v))).join(' ');
  return (
    <section className="rounded-xl border border-sky-900/70 bg-[#071827] p-3" aria-label={text(block.title, 120) || 'Wykres'}>
      <div className="flex items-center gap-2 text-sm font-semibold text-sky-100 mb-2"><BarChart3 size={16} /> {text(block.title, 120) || 'Wykres danych'}</div>
      <svg viewBox="0 0 560 215" role="img" aria-label={'Wykres: ' + labels.map((l, i) => l + ' ' + values[i] + unit).join(', ')} className="w-full h-auto min-h-[140px]">
        {[0, 1, 2, 3, 4].map((k) => (
          <g key={k}>
            <line x1={left} y1={top + k * (height - top - bottom) / 4} x2={width - right} y2={top + k * (height - top - bottom) / 4} stroke="#24445e" strokeWidth={1} />
            <text x={left - 7} y={top + k * (height - top - bottom) / 4 + 4} fontSize={10} fill="#a5c3d8" textAnchor="end">{(max - k * scale / 4).toFixed(0)}{unit}</text>
          </g>
        ))}
        {bar ? values.map((v, i) => {
          const w = Math.min(35, (width - left - right) / values.length * 0.65);
          const from = y(Math.max(0, min));
          return <rect key={i} x={x(i) - w / 2} y={Math.min(y(v), from)} width={w} height={Math.max(1, Math.abs(from - y(v)))} rx={3} fill="#22d3ee"><title>{labels[i]}: {v}{unit}</title></rect>;
        }) : <>
          <polyline points={coords} fill="none" stroke="#22d3ee" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"/>
          {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={4} fill="#67e8f9" stroke="#082f49" strokeWidth={2}><title>{labels[i]}: {v}{unit}</title></circle>)}
        </>}
        {labels.map((l, i) => (i % Math.ceil(labels.length / 8) === 0 || i === labels.length - 1) && <text key={i} x={x(i)} y={height - 12} fontSize={10} textAnchor="middle" fill="#a5c3d8">{l}</text>)}
      </svg>
      {text(block.caption) && <p className="mt-1 text-xs text-slate-400">{text(block.caption)}</p>}
    </section>
  );
}

function VideoPlayer({ src, title }: { src: string; title: string }) {
  const [enabled, setEnabled] = useState(false);
  const embed = youtubeEmbed(src);
  return <div className="rounded-xl overflow-hidden border border-slate-700 bg-black">
    {embed ? (enabled
      ? <iframe title={title} src={embed} loading="lazy" className="w-full aspect-video" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      : <button type="button" onClick={() => setEnabled(true)} className="w-full aspect-video flex flex-col items-center justify-center gap-3 text-slate-100 hover:bg-slate-900">
          <Play size={36}/><span>Odtwórz YouTube</span><small className="text-slate-400">Załadowanie wideo łączy się z YouTube</small>
        </button>)
      : <video src={src} controls preload="metadata" playsInline className="w-full max-h-[420px]" aria-label={title} />}
    <p className="px-3 py-2 text-xs text-slate-300">{title}</p>
  </div>;
}

function Widget({ block, onPrompt, onOpenTerminal }: { block: WorkBlock; onPrompt: (prompt: string) => void; onOpenTerminal?: () => void }) {
  const kind = block.type;
  if (kind === 'progress') return <ProgressWorkWidget block={block}/>;
  if (kind === 'steps') return <StepsWorkWidget block={block}/>;
  if (kind === 'files') return <FileExplorerWorkWidget block={block}/>;
  if (kind === 'model_config') return <ModelSettingsWorkWidget block={block} onPrompt={onPrompt}/>;
  if (kind === 'diagram3d') return <ThreeDWorkWidget block={block}/>;
  if (kind === 'pdf') return <PdfWorkWidget block={block}/>;
  if (['alert','timeline','accordion','tabs','checklist','form','code','handoff','curl','http','json','diff','logs'].includes(String(kind))) return <AdvancedWorkWidget block={block} onPrompt={onPrompt}/>;
  if (kind === 'terminal') {
    const types = new Set(['input','output','success','error','system','banner']);
    const entries: TerminalCardEntry[] = Array.isArray(block.entries)
      ? block.entries.slice(0, 60).filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v))
        .map(v => ({ type: types.has(String(v.type)) ? v.type as TerminalCardEntry['type'] : 'output',
          text: text(v.text, 4000), time: text(v.time, 30) }))
      : [];
    const status: TerminalCardStatus = ['idle','running','success','error'].includes(String(block.status))
      ? block.status as TerminalCardStatus : 'idle';
    return <TerminalWorkCard title={text(block.title, 110) || 'Terminal · odpowiedź AI'}
      command={text(block.command, 1200)} status={status} entries={entries}
      progress={typeof block.progress === 'number' && Number.isFinite(block.progress) ? block.progress : null}
      source="Treść przesłana przez agenta — niezweryfikowana przez backend"
      onOpenTerminal={onOpenTerminal} compact />;
  }
  if (kind === 'chart') return <Chart block={block}/>;
  if (kind === 'image') {
    const src = safeSource(block.src);
    return src ? <figure className="rounded-xl overflow-hidden border border-slate-700 bg-[#081625]">
      <img src={src} alt={text(block.alt, 180) || 'Grafika od agenta'} loading="lazy" className="block max-h-[460px] max-w-full mx-auto object-contain"/>
      {text(block.caption) && <figcaption className="p-2 text-xs text-slate-300">{text(block.caption)}</figcaption>}
    </figure> : <p className="text-xs text-amber-300">Grafika wymaga bezpiecznego adresu HTTPS lub ścieżki lokalnej.</p>;
  }
  if (kind === 'video') {
    const src = safeSource(block.src);
    return src ? <VideoPlayer src={src} title={text(block.title, 120) || 'Wideo od agenta'}/> : <p className="text-xs text-amber-300">Nieobsługiwany adres wideo.</p>;
  }
  if (kind === 'metric') {
    return <div className="inline-flex min-w-[130px] flex-col rounded-xl border border-slate-700 bg-slate-900 p-3">
      <span className="text-xs text-slate-400">{text(block.label, 100)}</span>
      <strong className="text-xl text-cyan-300">{text(block.value, 80) || String(block.value ?? '—').slice(0, 80)}</strong>
      {text(block.detail) && <span className="text-xs text-slate-400">{text(block.detail)}</span>}
    </div>;
  }
  if (kind === 'actions' && Array.isArray(block.actions)) {
    return <div className="flex flex-wrap gap-2" aria-label="Akcje czatu">
      {block.actions.slice(0, 6).map((action, i) => {
        if (!action || typeof action !== 'object') return null;
        const a = action as Record<string, unknown>;
        const prompt = text(a.prompt, 4000);
        return <button key={i} type="button" disabled={!prompt} onClick={() => onPrompt(prompt)}
          className="rounded-lg border border-sky-700/60 bg-[#0d364a] px-3 py-2 text-xs font-semibold text-sky-100 hover:bg-[#14506c] disabled:opacity-40">
          {text(a.label, 80) || 'Przygotuj polecenie'}
        </button>;
      })}
    </div>;
  }
  if (kind === 'table' && Array.isArray(block.columns) && Array.isArray(block.rows)) {
    const cols = block.columns.slice(0, 8).map((cell) => String(cell).slice(0, 60));
    return <div className="overflow-x-auto rounded-lg border border-slate-700">
      <table className="w-full text-left text-xs border-collapse">
        <thead className="bg-slate-800"><tr>{cols.map((v, i) => <th key={i} className="p-2">{v}</th>)}</tr></thead>
        <tbody>{block.rows.slice(0, 50).map((row, i) => <tr key={i} className="border-t border-slate-800">{cols.map((_, j) => <td key={j} className="p-2">{Array.isArray(row) ? String(row[j] ?? '').slice(0, 150) : ''}</td>)}</tr>)}</tbody>
      </table>
    </div>;
  }
  if (kind === 'text') return <FormattedMessage content={text(block.content, 12000)}/>;
  return null;
}

function RichCard({ raw, onPrompt, onOpenTerminal }: { raw: string; onPrompt: (prompt: string) => void; onOpenTerminal?: () => void }) {
  let payload: WorkPayload;
  try {
    payload = JSON.parse(raw) as WorkPayload;
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.blocks)) throw new Error();
  } catch {
    return <pre className="text-xs whitespace-pre-wrap text-amber-300">Nieprawidłowy format bloku bastilla-ui.</pre>;
  }
  return <section className="my-3 rounded-2xl border border-sky-800/80 bg-[#0b1c2f] p-3 sm:p-4 space-y-3" aria-label="Interaktywna odpowiedź agenta">
    <div className="flex items-center gap-2 text-sky-200 font-bold text-sm"><Sparkles size={16}/>{text(payload.title, 120) || 'Bastilla · Work Card'}</div>
    {payload.blocks.slice(0, MAX_BLOCKS).filter((block) => block && typeof block === 'object').map((block, index) =>
      <Widget key={index} block={block} onPrompt={onPrompt} onOpenTerminal={onOpenTerminal}/>)}
  </section>;
}

/**
 * Renders normal agent messages with the existing Markdown/media renderer,
 * and optional fenced bastilla-ui JSON cards. No code executes from JSON.
 */
export function WorkChatMessage({ content, onPrompt, onOpenTerminal }: WorkChatMessageProps) {
  const segments: React.ReactNode[] = [];
  const regex = /```bastilla-ui\s*\n([\s\S]*?)```/gi;
  let last = 0, match: RegExpExecArray | null, i = 0;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > last) segments.push(<FormattedMessage key={'text-' + i} content={content.slice(last, match.index)}/>);
    segments.push(<RichCard key={'widget-' + i} raw={match[1]} onPrompt={onPrompt} onOpenTerminal={onOpenTerminal}/>);
    last = regex.lastIndex; i++;
    if (i >= 10) break;
  }
  if (last < content.length) segments.push(<FormattedMessage key={'tail'} content={content.slice(last)}/>);
  return <div className="min-w-0">{segments.length ? segments : <FormattedMessage content={content}/>}</div>;
}

const examples = {
  chart: {
    title: 'Monitoring zasobów — dane demonstracyjne',
    blocks: [
      { type: 'metric', label: 'CPU (przykład)', value: '42%' },
      { type: 'chart', title: 'Wykres obciążenia CPU', labels: ['08:00','09:00','10:00','11:00','12:00','13:00'], values: [23,34,47,31,58,42], unit: '%', caption: 'Przykładowe dane, nie odczyt z komputera.' },
    ],
  },
  image: {
    title: 'Wizualizacje i grafiki',
    blocks: [{ type: 'text', content: 'Agent może odesłać grafikę jako **HTTPS** lub lokalny plik **/assets/...**. Obrazy będą wyświetlane w wiadomościach z podpisem. Obsługiwane są również obrazy Markdown i wektorowe SVG.' }],
  },
  video: {
    title: 'Odtwarzanie wideo',
    blocks: [{ type: 'text', content: 'Agent może zwrócić link do filmu **MP4 / WebM** albo **YouTube**. Dla YouTube odtwarzacz jest ładowany dopiero po kliknięciu. Nie symulujemy nagrań ani transmisji.' }],
  },
  advanced: {
    title: 'Zaawansowane komponenty AI · przykłady',
    blocks: [
      { type: 'progress', title: 'Raport demonstracyjny', value: 68, description: 'Dane demonstracyjne — bez połączenia z workerem.' },
      { type: 'steps', title: 'Etapy prezentacji', active: 2, steps: ['Analiza', 'Wykres', 'Karta terminala', 'Weryfikacja'] },
      { type: 'diagram3d', title: 'Przestrzenny podgląd modułu' },
      { type: 'files', title: 'Przykładowe pliki w odpowiedzi', files: [{name:'demo.ts',path:'src/demo.ts',content:'export const bastilla = "work";'}] },
      { type: 'model_config', model: 'Model demo', temperature: 0.7, maxTokens: 4096 },
    ],
  },
  terminal: {
    title: 'Terminal osadzony w wiadomości',
    blocks: [{ type: 'terminal', title: 'BASTILLA / TERMINAL', command: 'status',
      status: 'success', entries: [
        { type: 'input', text: '$ status', time: 'DEMO' },
        { type: 'system', text: 'Tryb demonstracyjny; brak odczytu z prawdziwego serwera.', time: 'DEMO' },
        { type: 'success', text: 'Przykładowy blok wyniku terminala.', time: 'DEMO' },
      ] }],
  },
  formatting: {
    title: 'Formatowanie techniczne — przykłady',
    blocks: [
      { type: 'curl', title: 'Przykładowe żądanie cURL (DEMO)', method: 'GET', url: '/api/system/metrics',
        headers: { Accept: 'application/json' }, response: { cpuPercent: null, ramUsedBytes: null, note: 'Brak pomiaru; to tylko podgląd formatu odpowiedzi.' } },
      { type: 'json', title: 'JSON / dane', data: { verified: false, status: 'demo', agents: ['Aria','Alex','Astyria','Aurelius'] } },
      { type: 'diff', title: 'Różnice w plikach (DEMO)', diff: '@@ -1,2 +1,2 @@\n-oldValue = false\n+newValue = true\n context = "demo"' },
      { type: 'logs', title: 'Filtr logów (DEMO)', entries: [
        { level: 'success', text: 'Przykładowy test pomyślny' },
        { level: 'error', text: 'Przykładowy błąd do diagnozy' },
      ] },
    ],
  },
  form: {
    title: 'Formularze i przekazania (DEMO)',
    blocks: [
      { type: 'form', title: 'Nowe zadanie', prompt: 'Przygotuj zadanie na podstawie tych danych:', fields: [
        { type: 'text', label: 'Opis', placeholder: 'Opisz problem' },
        { type: 'select', label: 'Priorytet', options: ['Normalny','Wysoki','Krytyczny'] },
        { type: 'checkbox', label: 'Zgłoszenie do weryfikacji' },
      ] },
      { type: 'checklist', title: 'Kroki diagnozy (DEMO)', items: [
        { label: 'Sprawdź aktualne logi' }, { label: 'Odczytaj stan modelu' }, { label: 'Przygotuj raport' },
      ] },
      { type: 'handoff', title: 'Przekaż zadanie', description: 'Przygotuj szkic wiadomości do wybranego agenta.', prompt: 'Zdiagnozuj status Ollamy i MCP oraz zaproponuj rozwiązanie.' },
    ],
  },
  action: {
    title: 'Interaktywne przyciski',
    blocks: [{ type: 'actions', actions: [
      { label: 'Raport diagnostyczny', prompt: 'Przygotuj raport diagnostyczny z potwierdzonych danych systemowych, rozdziel sukcesy i błędy.' },
      { label: 'Wykres CPU/RAM', prompt: 'Przygotuj interaktywny wykres CPU i RAM z rzeczywistych pomiarów. Jeśli ich nie ma, poinformuj o tym.' },
      { label: 'Pokaż aktywne zadania', prompt: 'Pokaż rzeczywiste aktywne zadania, ich postępy, logi i błędy.' },
    ] }],
  },
} as const;

export function WorkChatDemo({ onPrompt, onOpenTerminal }: { onPrompt: (prompt: string) => void; onOpenTerminal?: () => void }) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<keyof typeof examples>('chart');
  return <div className="border-b border-sky-900 bg-[#091827] px-3 py-2">
    <div className="flex items-center justify-between gap-2">
      <div className="flex gap-2 items-center"><Sparkles size={16} className="text-cyan-300"/><strong className="text-sm text-white">Work · interaktywny podgląd</strong></div>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="text-xs text-cyan-200 p-2 flex gap-1 items-center">{open ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} {open ? 'Zwiń' : 'Rozwiń'}</button>
    </div>
    {open && <div className="pt-2">
      <div className="flex flex-wrap gap-1.5 mb-2">
        {([
          ['chart', BarChart3, 'Wykres'],
          ['image', ImageIcon, 'Grafiki'],
          ['video', Clapperboard, 'Wideo'],
          ['action', Code2, 'Przyciski'],
          ['terminal', Code2, 'Terminal'],
          ['formatting', Code2, 'cURL / JSON'],
          ['form', Sparkles, 'Formularze'],
          ['advanced', Sparkles, 'Zaawansowane'],
        ] as const).map(([key, Icon, label]) =>
          <button key={key} type="button" onClick={() => setTab(key)} aria-pressed={tab === key} className={'px-3 py-2 rounded-lg text-xs flex gap-1.5 items-center border ' + (tab === key ? 'bg-cyan-900/70 border-cyan-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-300')}><Icon size={14}/>{label}</button>)}
      </div>
      <RichCard raw={JSON.stringify(examples[tab])} onPrompt={onPrompt} onOpenTerminal={onOpenTerminal}/>
      <p className="text-[11px] text-slate-400">To podgląd możliwości. Rzeczywiste dane i multimedia muszą pochodzić z wiadomości agenta.</p>
    </div>}
  </div>;
}
