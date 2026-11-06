import React, { useEffect, useRef, useState } from 'react';
import { Camera, FileText, Video, Mic, Code2, Terminal, Github, FolderOpen, Activity, Wrench, History, Bug, Plus, X } from 'lucide-react';

type Kind = 'image' | 'document' | 'video' | 'audio' | 'code' | 'logs';
type Source = 'github' | 'explorer' | 'terminal' | 'diagnostics' | 'mcp' | 'screenshot' | 'error' | 'history';
type Props = { disabled?: boolean; onFiles: (kind: Kind) => void; onSource: (source: Source) => void };
const files = [
  {id:'image' as const, name:'Zdjęcia', detail:'PNG, JPG, WebP', icon:Camera},
  {id:'document' as const, name:'Dokumenty', detail:'PDF, DOCX, TXT', icon:FileText},
  {id:'video' as const, name:'Wideo', detail:'MP4, WebM', icon:Video},
  {id:'audio' as const, name:'Nagrania', detail:'WAV, MP3', icon:Mic},
  {id:'code' as const, name:'Kod i skrypty', detail:'JS, TS, PY, JSON', icon:Code2},
  {id:'logs' as const, name:'Pliki logów', detail:'LOG, TXT, JSON', icon:Terminal},
];
const sources = [
  {id:'github' as const,name:'GitHub',icon:Github},
  {id:'explorer' as const,name:'Eksplorator',icon:FolderOpen},
  {id:'terminal' as const,name:'Terminal',icon:Terminal},
  {id:'diagnostics' as const,name:'Diagnostyka',icon:Activity},
  {id:'mcp' as const,name:'MCP',icon:Wrench},
  {id:'screenshot' as const,name:'Zrzut ekranu',icon:Camera},
  {id:'error' as const,name:'Raport błędu',icon:Bug},
  {id:'history' as const,name:'Historia czatu',icon:History},
];
export function ChatAttachmentMenu({disabled,onFiles,onSource}:Props) {
  const [open,setOpen] = useState(false);
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};
    document.addEventListener('pointerdown',outside);
    document.addEventListener('keydown',escape);
    return ()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[open]);
  useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
  return <div className="relative shrink-0" ref={root}>
    <button type="button" aria-label="Dodaj załącznik" aria-expanded={open} aria-haspopup="dialog" disabled={disabled}
      onClick={()=>setOpen(v=>!v)} className="flex h-11 w-11 items-center justify-center rounded-full text-slate-100 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-40">
      {open?<X className="h-5 w-5"/>:<Plus className="h-6 w-6"/>}
    </button>
    {open&&<div role="dialog" aria-label="Menu załączników" className="absolute bottom-full left-0 z-50 mb-2 max-h-[min(65vh,520px)] w-[min(340px,calc(100vw-30px))] overflow-y-auto rounded-2xl border border-cyan-300/25 bg-[#132d40] p-3 shadow-2xl shadow-black/70">
      <div className="mb-3 flex items-center justify-between"><strong className="text-sm text-slate-100">Dodaj załącznik</strong><button type="button" aria-label="Zamknij menu" onClick={()=>setOpen(false)} className="rounded-lg p-1 text-slate-300 hover:bg-white/10"><X className="h-4 w-4"/></button></div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Pliki z urządzenia</p>
      <div className="grid grid-cols-2 gap-2">{files.map(item=><button key={item.id} type="button" onClick={()=>{setOpen(false);onFiles(item.id);}} className="flex min-h-20 flex-col items-start gap-1 rounded-xl border border-white/10 bg-[#1a3a50] p-3 text-left hover:border-cyan-300/60 hover:bg-[#244a61] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"><item.icon className="h-5 w-5 text-cyan-300"/><span className="text-xs font-semibold text-slate-100">{item.name}</span><span className="text-[10px] text-slate-400">{item.detail}</span></button>)}</div>
      <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Źródła i narzędzia</p>
      <div className="grid grid-cols-2 gap-2">{sources.map(item=><button key={item.id} type="button" onClick={()=>{setOpen(false);onSource(item.id);}} className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-[#1a3a50] px-3 text-left text-xs font-medium text-slate-100 hover:border-cyan-300/60 hover:bg-[#244a61] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"><item.icon className="h-4 w-4 shrink-0 text-cyan-300"/>{item.name}</button>)}</div>
      <p className="mt-3 text-[11px] text-slate-400">Źródła systemowe przygotowują prośbę do czatu; nie pobierają danych bez autoryzacji.</p>
    </div>}
  </div>;
}
