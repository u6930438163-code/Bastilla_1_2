import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Cloud, Cpu, Server } from 'lucide-react';

export type EngineMode = 'api' | 'ollama';
type Props = { value: EngineMode; onChange: (value: EngineMode) => void; disabled?: boolean };

/** Accessible custom popover instead of the oversized native mobile select. */
export function ChatEngineSelector({ value, onChange, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  const items = [
    { id: 'api' as const, name: 'OpenAI API', subtitle: 'Model przez API', icon: Cloud },
    { id: 'ollama' as const, name: 'Ollama', subtitle: 'Model lokalny lub zdalny', icon: Server },
  ];
  const current = items.find(item => item.id === value) ?? items[0];
  const CurrentIcon = current.icon;

  return <div className="relative shrink-0" ref={root}>
    <button type="button" aria-label="Wybierz silnik AI" aria-expanded={open}
      aria-haspopup="menu" disabled={disabled} onClick={() => setOpen(previous => !previous)}
      className="flex min-h-11 items-center gap-2 rounded-2xl border border-cyan-300/30 bg-[#163348] px-3 text-sm font-medium text-slate-100 shadow-sm transition hover:border-cyan-300/70 hover:bg-[#21465c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50">
      <CurrentIcon className="h-4 w-4 text-cyan-300" aria-hidden="true"/>
      <span>{current.name}</span>
      <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true"/>
    </button>
    {open && <div role="menu" aria-label="Silnik AI"
      className="absolute bottom-full right-0 z-50 mb-2 w-[min(290px,calc(100vw-36px))] rounded-2xl border border-cyan-200/25 bg-[#142d40] p-2 shadow-2xl shadow-black/60">
      <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Wybierz silnik AI</p>
      {items.map(item => {
        const Icon = item.icon;
        return <button key={item.id} type="button" role="menuitemradio" aria-checked={value === item.id}
          onClick={() => { onChange(item.id); setOpen(false); }}
          className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${value === item.id ? 'bg-cyan-300/10' : ''}`}>
          <Icon className="h-5 w-5 shrink-0 text-cyan-300" aria-hidden="true"/>
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-100">{item.name}</span><span className="block text-xs text-slate-400">{item.subtitle}</span></span>
          {value === item.id && <Check className="h-5 w-5 text-emerald-300" aria-hidden="true"/>}
        </button>;
      })}
      <div className="mt-1 flex items-center gap-2 border-t border-white/10 px-3 pt-2 text-xs text-slate-400">
        <Cpu className="h-4 w-4" aria-hidden="true"/>
        Silnik deterministyczny — integracja w przygotowaniu
      </div>
    </div>}
  </div>;
}
