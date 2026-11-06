import React, { useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';

/**
 * Safely renders compact inline technical formatting in an agent message.
 * All values are plain text (React-escaped). This component never evaluates
 * markup or executes commands supplied by an agent.
 */
type InlineItem = Record<string, unknown>;
type Props = { block: Record<string, unknown> };

const MAX_ITEMS = 48;
const MAX_VALUE = 320;

function label(value: unknown, maxLength = MAX_VALUE): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

const tones: Record<string, string> = {
  success: 'border-emerald-600/50 bg-emerald-950/50 text-emerald-200',
  warning: 'border-amber-600/50 bg-amber-950/50 text-amber-200',
  error: 'border-rose-600/50 bg-rose-950/50 text-rose-200',
  info: 'border-sky-600/50 bg-sky-950/50 text-sky-200',
  code: 'border-slate-700 bg-slate-900 text-cyan-200 font-mono',
  command: 'border-cyan-800 bg-[#071c2b] text-cyan-200 font-mono',
  path: 'border-indigo-700/50 bg-indigo-950/30 text-indigo-200 font-mono',
  badge: 'border-slate-600 bg-slate-800 text-slate-100',
  highlight: 'border-yellow-700/40 bg-yellow-500/15 text-yellow-100',
  kbd: 'border-slate-500 bg-slate-800 text-white font-mono shadow-[inset_0_-2px_0_#334155]',
};

const prefixes: Record<string, string> = {
  success: '✓ ', warning: '⚠ ', error: '✕ ', info: 'ⓘ ',
};

export function RichInlineWidget({ block }: Props) {
  const [copied, setCopied] = useState<number | null>(null);
  const items: InlineItem[] = Array.isArray(block.items)
    ? block.items.slice(0, MAX_ITEMS).filter((item): item is InlineItem =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];

  if (items.length === 0) {
    return <p className="text-xs text-amber-300">Brak elementów formatowania.</p>;
  }

  return (
    <section aria-label={label(block.title, 100) || 'Formatowanie techniczne'}
      className="rounded-xl border border-slate-700/80 bg-[#091726] p-3">
      {label(block.title, 100) && (
        <p className="mb-2 text-xs font-semibold text-slate-200">{label(block.title, 100)}</p>
      )}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[12px] leading-relaxed">
        {items.map((item, index) => {
          const kind = label(item.kind, 24).toLowerCase();
          const value = label(item.value);
          if (kind === 'break') {
            return <span key={index} aria-hidden="true" className="block basis-full h-0" />;
          }
          if (!value) return null;
          if (kind === 'text') {
            return <span key={index} className="whitespace-pre-wrap text-slate-200">{value}</span>;
          }
          if (kind === 'copy') {
            return (
              <button key={index} type="button"
                aria-label={'Kopiuj: ' + label(item.label, 80)}
                onClick={() => {
                  void navigator.clipboard?.writeText(value)
                    .then(() => setCopied(index))
                    .catch(() => setCopied(null));
                }}
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-cyan-700/60
                  bg-cyan-950/40 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-900/50
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
              >
                {copied === index ? <Check size={13}/> : <Copy size={13}/>}
                <span className="min-w-0 break-all">{copied === index ? 'Skopiowano' : label(item.label, 80) || value}</span>
              </button>
            );
          }
          const style = tones[kind] ?? tones.badge;
          return (
            <span key={index} title={label(item.hint, 200) || undefined}
              className={'inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 break-all ' + style}>
              {kind === 'command' && <Terminal size={12} aria-hidden="true"/>}
              <span>{(prefixes[kind] ?? '') + value}</span>
            </span>
          );
        })}
      </div>
      {label(block.caption, 300) && (
        <p className="mt-2 text-[11px] text-slate-400">{label(block.caption, 300)}</p>
      )}
    </section>
  );
}
