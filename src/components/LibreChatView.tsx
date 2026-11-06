import React, { useEffect, useState } from 'react';

type AgentState = { status: 'online' | 'offline'; lastSeen: string | null };
type LiveStatus = { agents: Record<string, AgentState> };
const AGENTS = ['Aria', 'Alex', 'Astyria', 'Aurelius'] as const;
const rawUrl = (import.meta.env.VITE_LIBRECHAT_URL || '').trim();

function getLibreChatUrl(): string | null {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.username || parsed.password) return null;
    const localhost = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && localhost)) return null;
    return parsed.href;
  } catch { return null; }
}

export function LibreChatView() {
  const [state, setState] = useState<LiveStatus | null>(null);
  const [notice, setNotice] = useState('Sprawdzanie sesji czatu Bastilla...');
  const url = getLibreChatUrl();

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch('/api/live-chat/status', {
          credentials: 'same-origin',
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (response.status === 401) {
          setNotice('Zaloguj się najpierw w Czat AI · LIVE, aby zobaczyć stany oryginalnych agentów.');
          return;
        }
        if (!response.ok) {
          setNotice('Status agentów niedostępny (HTTP ' + response.status + ').');
          return;
        }
        const data = await response.json() as LiveStatus;
        if (data?.agents) {
          setState(data);
          setNotice('Status pochodzi z bieżących heartbeatów w Bastilla LIVE; nie oznacza gotowości LibreChat.');
        } else {
          setNotice('Serwer zwrócił niepełny status agentów.');
        }
      } catch (error) {
        if (!controller.signal.aborted) setNotice('Brak połączenia z serwerem Bastilla LIVE.');
      }
    })();
    return () => controller.abort();
  }, []);

  return (
    <section className="min-h-0 flex-1 overflow-y-auto bg-[#050b18] p-4 text-slate-100">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-cyan-200">LibreChat · Bastilla</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Niezależny interfejs LibreChat z połączeniem przez wewnętrzny adapter do istniejącej kolejki Bastilla LIVE.
          Oryginalni agenci pozostają w Bastilla; nie są zastępowani nowymi modelami.
        </p>
      </header>
      <div className="mb-5 rounded-xl border border-slate-700 bg-slate-900/80 p-5">
        <h2 className="font-semibold">Panel LibreChat</h2>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer"
             className="mt-3 inline-block rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600">
            Otwórz LibreChat w nowej karcie
          </a>
        ) : (
          <p className="mt-2 text-sm text-amber-300">
            Adres panelu nie jest skonfigurowany. Ustaw VITE_LIBRECHAT_URL na publiczny adres HTTPS LibreChat
            (lub localhost podczas testów), a następnie przebuduj Bastilla.
          </p>
        )}
        <p className="mt-3 text-xs text-slate-400">
          LibreChat wymaga osobnego uruchomienia Docker i zalogowania. Jego gotowość nie jest tu automatycznie potwierdzana.
        </p>
      </div>
      <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-5">
        <h2 className="mb-3 font-semibold">Oryginalni agenci Bastilla LIVE</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {AGENTS.map(agent => (
            <div key={agent} className="rounded-lg border border-slate-700 bg-slate-950 p-3">
              <div className="font-semibold">{agent}</div>
              <div className="mt-1 text-sm text-slate-300">
                {state?.agents?.[agent]?.status === 'online' ? 'Online (heartbeat)' :
                 state ? 'Offline' : 'Niezweryfikowany'}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">{notice}</p>
      </div>
      <p className="mt-5 text-xs text-slate-500">
        Konfiguracja i testy: docs/LIBRECHAT_INTEGRATION.md. Klucze API i hasła pozostają poza repozytorium.
      </p>
    </section>
  );
}
