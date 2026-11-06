import React from 'react';
import { ArrowRight, ClipboardCheck, ExternalLink, Sparkles, Terminal } from 'lucide-react';

/**
 * A strictly declarative AI-selected guidance card.
 * Clicking "prompt" creates an editable draft; "terminal" only opens the
 * terminal view. No commands, links, shell, JavaScript or backend operations
 * can be executed by untrusted model-supplied widget data.
 */
type Action = Record<string, unknown>;
type Props = {
  block: Record<string, unknown>;
  onPrompt: (prompt: string) => void;
  onOpenTerminal?: () => void;
};

const getText = (v: unknown, cap: number): string =>
  typeof v === 'string' ? v.trim().slice(0, cap) : '';

export function AgentChoiceWidget({ block, onPrompt, onOpenTerminal }: Props) {
  const title = getText(block.title, 120) || 'Propozycja następnego kroku';
  const description = getText(block.description, 1400);
  const rawSteps = Array.isArray(block.steps) ? block.steps.slice(0, 6) : [];
  const steps = rawSteps.map((step) => getText(step, 240)).filter(Boolean);
  const rawActions = Array.isArray(block.actions) ? block.actions.slice(0, 6) : [];
  const actions = rawActions.filter((value): value is Action =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  ).map((action) => ({
    label: getText(action.label, 90),
    prompt: getText(action.prompt, 2500),
    kind: getText(action.kind, 16),
  })).filter((action) => action.label && (action.prompt || (action.kind === 'terminal' && onOpenTerminal)));
  if (!description && steps.length === 0 && actions.length === 0) return null;

  return (
    <section className="rounded-xl border border-cyan-800/70 bg-[#071d2d] p-3 shadow-md"
      aria-label={'Dowolność AI: ' + title}>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-cyan-100">
        <Sparkles size={17} className="text-cyan-300" aria-hidden="true"/>
        <span>{title}</span>
      </div>
      {description && <p className="text-xs leading-relaxed whitespace-pre-wrap text-slate-200">{description}</p>}
      {steps.length > 0 && (
        <ol className="my-3 space-y-2" aria-label="Sugerowane kroki">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full
                bg-cyan-950 text-cyan-300 border border-cyan-700">{i + 1}</span>
              <span className="whitespace-pre-wrap">{step}</span>
            </li>
          ))}
        </ol>
      )}
      {actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Działania do wyboru">
          {actions.map((action, i) => {
            const terminal = action.kind === 'terminal';
            return <button key={i} type="button"
              onClick={() => terminal ? onOpenTerminal?.() : onPrompt(action.prompt)}
              title={terminal ? 'Otwórz istniejący terminal' : 'Wstaw szkic do czatu — zatwierdzisz wysłanie'}
              className={'inline-flex max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ' +
                (i === 0 ? 'bg-cyan-800/60 border-cyan-500 text-white hover:bg-cyan-700/60' :
                  'bg-slate-900 border-slate-600 text-cyan-100 hover:bg-cyan-950')}>
              {terminal ? <Terminal size={14}/> : i === 0 ? <ArrowRight size={14}/> : <ClipboardCheck size={14}/>}
              <span className="text-left break-words">{action.label}</span>
              {terminal && <ExternalLink size={12} aria-hidden="true"/>}
            </button>;
          })}
        </div>
      )}
      <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
        Propozycje AI. Przyciski tworzą szkic do zatwierdzenia lub otwierają terminal;
        nie wykonują automatycznie poleceń.
      </p>
    </section>
  );
}
