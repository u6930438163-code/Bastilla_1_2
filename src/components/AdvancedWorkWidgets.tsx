import React, { useMemo, useState } from 'react';
import { CheckCircle2, Circle, Clipboard, ExternalLink, FileCode2, FileText, FolderOpen, Settings2, ShieldCheck } from 'lucide-react';

type RecordData = Record<string, unknown>;
const txt = (value: unknown, max = 160) => typeof value === 'string' ? value.slice(0,max) : '';
const clamp = (v: number, a: number, b: number) => Math.max(a,Math.min(v,b));

function secureResource(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  const v = value.trim();
  if (v.startsWith('/') && !v.startsWith('//') && !v.includes('\\')) return v;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
  } catch { return null; }
}

export function ProgressWorkWidget({ block }: { block: RecordData }) {
  const pct = typeof block.value === 'number' && Number.isFinite(block.value) ? clamp(block.value,0,100) : null;
  return <div className="rounded-xl border border-cyan-900/70 bg-[#091b2c] p-3 space-y-2">
    <div className="flex items-center justify-between gap-2">
      <strong className="text-sm text-sky-100">{txt(block.title,120) || 'Postęp zadania'}</strong>
      <span className="text-xs text-cyan-300">{pct===null?'Brak danych':pct.toFixed(0)+'%'}</span>
    </div>
    <div className="h-2 overflow-hidden rounded-full bg-slate-700" role="progressbar" aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={pct===null?undefined:pct}>
      <div className={'h-full rounded-full bg-cyan-400 ' + (pct===null?'animate-pulse':'')}
        style={{width:(pct===null?30:pct)+'%'}}/>
    </div>
    {txt(block.description) && <p className="text-xs text-slate-400">{txt(block.description,500)}</p>}
    <p className="text-[10px] text-slate-500">Stan zadeklarowany w odpowiedzi agenta, nie automatyczny pomiar wykonywania.</p>
  </div>;
}

export function StepsWorkWidget({ block }: { block: RecordData }) {
  const steps = Array.isArray(block.steps) ? block.steps.slice(0,12) : [];
  const active = typeof block.active === 'number' && Number.isFinite(block.active) ? Math.round(block.active) : -1;
  return <section className="rounded-xl border border-slate-700 bg-[#091b2c] p-3 space-y-3">
    <h4 className="text-sm font-semibold text-white">{txt(block.title) || 'Etapy zadania'}</h4>
    <div className="flex gap-1" aria-hidden="true">{steps.map((_,i)=><span key={i} className={'h-1.5 flex-1 rounded-full '+(i<=active?'bg-cyan-400':'bg-slate-700')}/>)}</div>
    {steps.map((step,i)=><div key={i} className="flex items-center gap-2 text-xs">
      {i<active?<CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300"/>:<Circle className={'h-4 w-4 shrink-0 '+(i===active?'text-cyan-300':'text-slate-600')}/>}
      <span className={i===active?'font-semibold text-cyan-100':'text-slate-300'}>{String(step).slice(0,150)}</span>
      {i===active&&<span className="ml-auto text-[10px] text-cyan-300">Bieżący</span>}
    </div>)}
    <p className="text-[10px] text-slate-500">Etapy raportowane przez agenta.</p>
  </section>;
}

export function FileExplorerWorkWidget({ block }: { block: RecordData }) {
  const files = useMemo(()=>Array.isArray(block.files) ? block.files.slice(0,30)
    .filter((f): f is RecordData => Boolean(f) && typeof f === 'object' && !Array.isArray(f))
    .map(f=>({name:txt(f.name,100),path:txt(f.path,150),content:txt(f.content,12000)}))
    .filter(f=>f.name) : [], [block.files]);
  const [selected,setSelected] = useState(0);
  const current = files[clamp(selected,0,Math.max(files.length-1,0))];
  return <section className="rounded-xl border border-slate-700 overflow-hidden bg-[#081725] text-slate-100" aria-label="Podgląd plików w wiadomości">
    <div className="flex items-center gap-2 bg-slate-900 px-3 py-2"><FolderOpen className="h-4 w-4 text-cyan-300"/><strong className="text-xs">{txt(block.title) || 'Pliki z odpowiedzi AI'}</strong></div>
    <div className="flex flex-wrap gap-1.5 border-y border-slate-800 p-2">
      {files.map((f,i)=><button type="button" key={i} onClick={()=>setSelected(i)}
        className={'flex gap-1 items-center rounded-lg border px-2.5 py-1.5 text-[11px] '+(selected===i?'border-cyan-500 bg-cyan-950':'border-slate-700 bg-slate-900')}>
        <FileCode2 className="h-3.5 w-3.5"/>{f.name}
      </button>)}
    </div>
    {current ? <div className="p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-cyan-300 break-all">{current.path || current.name}</span>
        <button type="button" className="text-xs text-slate-300 hover:text-white" onClick={()=>void navigator.clipboard?.writeText(current.content)} aria-label="Kopiuj treść pliku"><Clipboard className="h-4 w-4"/></button>
      </div>
      <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-[#020a12] p-3 text-[11px] text-slate-200">{current.content || 'Brak zawartości w odpowiedzi.'}</pre>
    </div> : <p className="p-3 text-xs text-slate-500">Nie podano plików.</p>}
    <p className="border-t border-slate-800 px-3 py-2 text-[10px] text-slate-500">To podgląd zawartości przesłanej w odpowiedzi. Nie odczytuje plików z dysku.</p>
  </section>;
}

export function ModelSettingsWorkWidget({ block, onPrompt }: { block: RecordData; onPrompt: (prompt: string) => void }) {
  const [model,setModel] = useState(txt(block.model,100) || 'Model nieokreślony');
  const [temp,setTemp] = useState(typeof block.temperature==='number' ? clamp(block.temperature,0,2) : .7);
  const [tokens,setTokens] = useState(typeof block.maxTokens==='number' ? clamp(block.maxTokens,512,16384) : 4096);
  const [stream,setStream] = useState(block.stream !== false);
  const config = {model,temperature:temp,maxTokens:tokens,stream};
  return <section className="rounded-xl border border-sky-900 bg-[#0c2233] p-3 space-y-3">
    <div className="flex gap-2 items-center"><Settings2 className="h-4 w-4 text-cyan-300"/><strong className="text-sm text-white">Model Config · propozycja</strong></div>
    <label className="block text-xs text-slate-300">Model
      <input value={model} maxLength={100} onChange={e=>setModel(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-700 bg-[#03111f] px-3 py-2 text-white"/>
    </label>
    <label className="flex justify-between text-xs text-slate-300">Temperature <span>{temp.toFixed(2)}</span></label>
    <input type="range" min="0" max="2" step=".05" value={temp} onChange={e=>setTemp(Number(e.target.value))} className="w-full accent-cyan-400"/>
    <label className="flex justify-between text-xs text-slate-300">Max Output Tokens <span>{tokens}</span></label>
    <input type="range" min="512" max="16384" step="512" value={tokens} onChange={e=>setTokens(Number(e.target.value))} className="w-full accent-cyan-400"/>
    <label className="flex gap-2 items-center text-xs text-slate-300"><input type="checkbox" checked={stream} onChange={e=>setStream(e.target.checked)} className="accent-cyan-500"/> Streaming</label>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={()=>void navigator.clipboard?.writeText(JSON.stringify(config,null,2))}
        className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-white flex gap-1 items-center"><Clipboard className="h-3.5 w-3.5"/> Kopiuj JSON</button>
      <button type="button" onClick={()=>onPrompt('Proszę ocenić proponowane ustawienia modelu (nie zapisuj bez mojej zgody): '+JSON.stringify(config))}
        className="rounded-lg bg-cyan-700 px-3 py-2 text-xs text-white flex gap-1 items-center"><ShieldCheck className="h-3.5 w-3.5"/> Przygotuj do zatwierdzenia</button>
    </div>
    <p className="text-[10px] text-slate-400">Zmiany lokalne w karcie. Nie zmieniają konfiguracji backendu.</p>
  </section>;
}

export function ThreeDWorkWidget({ block }: { block: RecordData }) {
  const [angle,setAngle] = useState(30);
  const [size,setSize] = useState(55);
  const vertices = useMemo(()=>{
    const rad=angle*Math.PI/180;
    return [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]
      .map(([x,y,z])=>{const xx=x*Math.cos(rad)+z*Math.sin(rad);const zz=z*Math.cos(rad)-x*Math.sin(rad);
        return {x:160+xx*size,y:108+(y*.85-zz*.36)*size};});
  },[angle,size]);
  const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  return <section className="rounded-xl border border-cyan-900 bg-[#071725] p-3 space-y-2">
    <h4 className="text-sm text-sky-100 font-semibold">{txt(block.title) || 'Bastilla 3D Renderer'}</h4>
    <svg viewBox="0 0 320 220" role="img" aria-label="Obrotowa wizualizacja szkieletowa sześcianu" className="w-full max-h-64">
      <rect width="320" height="220" rx="12" fill="#05121f"/>
      {edges.map(([a,b],i)=><line key={i} x1={vertices[a].x} y1={vertices[a].y} x2={vertices[b].x} y2={vertices[b].y} stroke={i<4?'#155e75':'#5eead4'} strokeWidth="2"/>)}
      {vertices.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="4" fill="#99f6e4"/>)}
      <text x="160" y="112" fill="#7dd3fc" fontSize="12" fontWeight="bold" textAnchor="middle">BASTILLA</text>
    </svg>
    <label className="flex gap-2 items-center text-xs text-slate-300">Obrót
      <input type="range" min="0" max="360" step="5" value={angle} onChange={e=>setAngle(Number(e.target.value))} className="flex-1 accent-cyan-400"/>
      {angle}°
    </label>
    <label className="flex gap-2 items-center text-xs text-slate-300">Skala
      <input type="range" min="30" max="75" value={size} onChange={e=>setSize(Number(e.target.value))} className="flex-1 accent-cyan-400"/>
      {size}%
    </label>
  </section>;
}

export function PdfWorkWidget({ block }: { block: RecordData }) {
  const src = secureResource(block.src);
  return <section className="rounded-xl border border-slate-700 bg-[#0b1e2d] p-3 space-y-2">
    <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-cyan-300"/><strong className="text-xs">{txt(block.title) || 'Dokument PDF'}</strong></div>
    {src ? <>
      <div className="flex flex-wrap items-center gap-2">
        <a href={src} target="_blank" rel="noopener noreferrer" className="inline-flex gap-1.5 items-center rounded-lg border border-cyan-800 bg-cyan-950/60 px-3 py-2 text-xs text-sky-100">
          <ExternalLink className="h-3.5 w-3.5"/> Otwórz PDF
        </a>
        <button type="button" onClick={()=>void navigator.clipboard?.writeText(src)} className="text-xs text-slate-400 hover:text-white">Kopiuj link</button>
      </div>
      <p className="text-xs text-slate-500">Podgląd w przeglądarce po kliknięciu; obsługa zależy od urządzenia i dostawcy dokumentu.</p>
    </> : <p className="text-xs text-amber-300">Brak poprawnego adresu HTTPS lub lokalnej ścieżki pliku.</p>}
  </section>;
}
