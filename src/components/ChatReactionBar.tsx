import React from 'react';
import { ThumbsDown, ThumbsUp, LoaderCircle } from 'lucide-react';
import { SYSTEM_AGENTS } from '../kernel/agents';
import { canonicalReactionActor, REACTION_ACTORS } from '../lib/chatReactionKeys.mjs';

export type ChatVote = 'up' | 'down';
export type ChatVotes = Record<string, ChatVote>;

const AVATAR_INITIALS: Record<string, string> = {
  Operator: 'TY', Aria: 'AR', Alex: 'AX', Astyria: 'AS', Aurelius: 'AU',
};

export function ChatAvatar({ actor, size = 'md' }: { actor: string; size?: 'sm' | 'md' }) {
  const name = canonicalReactionActor(actor);
  const profile = SYSTEM_AGENTS[name === 'Aria' ? 'si_1' : name];
  const classes = profile?.avatarColor ?? 'border-slate-600 bg-slate-700 text-slate-200';
  return <span aria-label={'Awatar: ' + (name === 'Operator' ? 'Ty' : name)}
    title={name === 'Operator' ? 'Ty · Operator' : name}
    className={'inline-flex shrink-0 items-center justify-center rounded-full border font-bold shadow-sm ' +
      (size === 'sm' ? 'h-6 w-6 text-[9px]' : 'h-9 w-9 text-[10px]') + ' ' + classes}>
    {AVATAR_INITIALS[name] || name.slice(0, 2).toUpperCase()}
  </span>;
}

/** Shows named votes without attributing hypothetical opinions to AI workers. */
export function ChatReactionBar({ votes = {}, disabled = false, onVote }: {
  votes?: ChatVotes;
  disabled?: boolean;
  onVote: (vote: ChatVote) => void;
}) {
  const valid = REACTION_ACTORS.filter((actor: string) =>
    votes[actor] === 'up' || votes[actor] === 'down'
  );
  const up = valid.filter((actor: string) => votes[actor] === 'up');
  const down = valid.filter((actor: string) => votes[actor] === 'down');
  const own = votes.Operator;
  return <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5" aria-label="Oceny tej wiadomości">
    <div className="inline-flex items-center gap-1" role="group" aria-label="Oceń wiadomość">
      <button type="button" aria-label={'Kciuk w górę. Głosów: ' + up.length}
        title={own === 'up' ? 'Cofnij własny kciuk w górę' : 'Oceń pozytywnie'}
        aria-pressed={own === 'up'} disabled={disabled} onClick={() => onVote('up')}
        className={'inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50 ' +
          (own === 'up' ? 'border-emerald-500/70 bg-emerald-950/80 text-emerald-200' :
          'border-slate-700 bg-slate-900 text-slate-400 hover:border-emerald-700 hover:text-emerald-300')}>
        {disabled ? <LoaderCircle size={15} className="animate-spin"/> : <ThumbsUp size={15} />}
        <span className="tabular-nums">{up.length}</span>
      </button>
      <button type="button" aria-label={'Kciuk w dół. Głosów: ' + down.length}
        title={own === 'down' ? 'Cofnij własny kciuk w dół' : 'Oceń negatywnie'}
        aria-pressed={own === 'down'} disabled={disabled} onClick={() => onVote('down')}
        className={'inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50 ' +
          (own === 'down' ? 'border-rose-500/70 bg-rose-950/80 text-rose-200' :
          'border-slate-700 bg-slate-900 text-slate-400 hover:border-rose-700 hover:text-rose-300')}>
        {disabled ? <LoaderCircle size={15} className="animate-spin"/> : <ThumbsDown size={15} />}
        <span className="tabular-nums">{down.length}</span>
      </button>
    </div>
    {valid.length > 0 && <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5" aria-label="Kto głosował">
      {valid.map((actor: string) => <span key={actor} className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-950/80 px-1.5 py-0.5"
        title={(actor === 'Operator' ? 'Ty' : actor) + ': ' + (votes[actor] === 'up' ? 'kciuk w górę' : 'kciuk w dół')}>
        <ChatAvatar actor={actor} size="sm"/>
        <span className="text-[10px] text-slate-300">{actor === 'Operator' ? 'Ty' : actor}</span>
        {votes[actor] === 'up' ? <ThumbsUp aria-label="Pozytywnie" className="h-3 w-3 text-emerald-400"/> :
          <ThumbsDown aria-label="Negatywnie" className="h-3 w-3 text-rose-400"/>}
      </span>)}
    </div>}
  </div>;
}
