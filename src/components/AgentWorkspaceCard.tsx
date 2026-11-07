import React, { useState } from 'react';
import { Bot, Check, X, GitPullRequest, Activity, Wrench, Send } from 'lucide-react';

export type WorkspaceAgent = 'triad'|'si_1'|'Alex'|'Astyria'|'Aurelius';
type TaskKind = 'review'|'diagnose'|'fix';
type Props = { disabled?:boolean; history?: Array<{agent:string;tekst:string}>; onPrepare:(agent:WorkspaceAgent,prompt:string)=>void };
const tasks:Record<TaskKind,{title:string;prompt:string;icon:typeof Bot}>={
  review:{title:'Przegląd GitHub',prompt:'Przeprowadź przegląd wskazanego repozytorium, pliku lub PR. Najpierw poproś o link. Zwróć ryzyka, testy i propozycje zmian. Nie scalaj bez zgody.',icon:GitPullRequest},
  diagnose:{title:'Diagnostyka',prompt:'Przygotuj diagnostykę dostępnych usług, logów i narzędzi. Pokaż rzeczywiste wyniki, a brak dostępu oznacz jawnie. Nie wykonuj zmian.',icon:Activity},
  fix:{title:'Propozycja naprawy',prompt:'Przygotuj propozycję naprawy z diffem, uzasadnieniem i testami. Zaczekaj na zatwierdzenie przed modyfikacją plików.',icon:Wrench}
};
export function AgentWorkspaceCard({disabled,history=[],onPrepare}:Props){
  const [agent,setAgent]=useState<WorkspaceAgent>('Alex');
  const [kind,setKind]=useState<TaskKind>('review');
  const [detail,setDetail]=useState('');
  const [approved,setApproved]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const agentHistory = history.filter(item => agent === 'triad' ? true : item.agent === agent || (agent === 'si_1' && item.agent === 'Aria'));
  const lastMessage = agentHistory.length ? agentHistory[agentHistory.length - 1] : null;
  const current=tasks[kind];
  const Icon=current.icon;
  return <section className="rounded-2xl border border-cyan-500/30 bg-[#10283a] p-3 text-slate-100" aria-label="Interaktywny panel zadań AI">
    <button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)} className="flex w-full items-center justify-between gap-2 text-left">
      <span className="flex items-center gap-2 text-sm font-semibold"><Bot className="h-5 w-5 text-cyan-300"/> AI Agent Workspace</span>
      <span className="text-xs text-cyan-300">{expanded?'Zwiń':'Rozwiń'}</span>
    </button>
    {expanded&&<div className="mt-3 space-y-3">
      <p className="text-xs text-slate-400">Wybierz agenta i działanie. Zatwierdzenie przygotowuje zadanie w czacie — nic nie uruchamia automatycznie.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {([['triad','Wszyscy'],['si_1','Aria'],['Alex','Alex'],['Astyria','Astyria'],['Aurelius','Aurelius']] as const).map(([id,name])=>
          <button type="button" key={id} aria-pressed={agent===id} onClick={()=>{setAgent(id);setApproved(false);}}
            className={`rounded-xl border px-2 py-2 text-xs ${agent===id?'border-cyan-300 bg-cyan-900/40 text-cyan-100':'border-slate-600 bg-[#19394e] text-slate-300'}`}>{name}</button>)}
      </div>
      <div className="rounded-xl border border-cyan-800/50 bg-[#091d2c] p-3" aria-live="polite">
        <div className="mb-2 flex items-center justify-between gap-2">
          <strong className="text-xs text-cyan-200">{agent === 'triad' ? 'Wszyscy agenci' : agent === 'si_1' ? 'Aria' : agent} · historia czatu</strong>
          <span className="text-[11px] text-slate-400">{agentHistory.length} wiadomości</span>
        </div>
        {lastMessage ? <div className="space-y-2">
          <p className="line-clamp-4 whitespace-pre-wrap break-words text-xs text-slate-200">{lastMessage.tekst}</p>
          <button type="button" onClick={() => setDetail(lastMessage.tekst.slice(0, 500))}
            className="rounded-lg border border-cyan-700 px-2 py-1 text-[11px] text-cyan-200 hover:bg-cyan-900/40">Użyj ostatniej wiadomości jako kontekstu</button>
        </div> : <p className="text-xs text-slate-400">Brak wiadomości w dostępnej historii. To nie oznacza, że agent jest offline.</p>}
      </div>
      <div className="grid grid-cols-3 gap-2">{(Object.entries(tasks) as [TaskKind,typeof current][]).map(([id,item])=>{
        const TaskIcon=item.icon;return <button type="button" key={id} aria-pressed={kind===id} onClick={()=>{setKind(id);setApproved(false);}}
          className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center text-[11px] ${kind===id?'border-cyan-300 bg-cyan-900/40':'border-slate-600 bg-[#19394e]'}`}><TaskIcon className="h-4 w-4"/>{item.title}</button>;
      })}</div>
      <label className="block text-xs text-slate-300" htmlFor="agent-workspace-detail">Repozytorium, link PR lub opis problemu</label>
      <textarea id="agent-workspace-detail" value={detail} onChange={event=>{setDetail(event.target.value);setApproved(false);}}
        maxLength={2000} rows={2} placeholder="Np. https://github.com/.../pull/12" className="w-full resize-y rounded-xl border border-slate-600 bg-[#091d2c] p-2 text-sm text-white placeholder:text-slate-500"/>
      <div className="rounded-xl border border-slate-700 bg-[#091d2c] p-3 text-xs">
        <div className="mb-1 flex items-center gap-2 font-semibold text-cyan-200"><Icon className="h-4 w-4"/>{current.title}</div>
        <p className="whitespace-pre-wrap text-slate-300">{current.prompt}</p>
        {detail.trim()&&<p className="mt-2 break-all text-slate-400">Kontekst: {detail.trim()}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={disabled} onClick={()=>setApproved(true)} className="flex items-center gap-1 rounded-xl bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40"><Check className="h-4 w-4"/> Zatwierdź szkic</button>
        <button type="button" onClick={()=>{setApproved(false);setDetail('');}} className="flex items-center gap-1 rounded-xl border border-slate-600 px-3 py-2 text-xs text-slate-300"><X className="h-4 w-4"/> Odrzuć</button>
        <button type="button" disabled={!approved||disabled} onClick={()=>{onPrepare(agent,current.prompt+(detail.trim()?'\\nKontekst użytkownika: '+detail.trim():''));setApproved(false);}} className="flex items-center gap-1 rounded-xl border border-emerald-500/40 px-3 py-2 text-xs text-emerald-200 disabled:opacity-40"><Send className="h-4 w-4"/> Wstaw do czatu</button>
      </div>
    </div>}
  </section>;
}
