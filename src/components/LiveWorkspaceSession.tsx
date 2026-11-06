import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, LoaderCircle, LockKeyhole, LogOut, RefreshCw, ShieldAlert, X } from 'lucide-react';

type SessionState = 'loading' | 'authenticated' | 'unauthenticated' | 'setup' | 'unconfigured' | 'error';
type AgentHealth = { status?: 'online' | 'offline'; queued?: number; running?: number; lastSeen?: string | null };
type LiveHealth = { agents?: Record<string, AgentHealth>; queue?: { queued?: number; running?: number; failed?: number } };

export function LiveWorkspaceSession({ onChange }: { onChange: (authenticated: boolean) => void }) {
  const [sessionState, setSessionState] = useState<SessionState>('loading');
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const autoOpened = React.useRef(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [health, setHealth] = useState<LiveHealth | null>(null);
  const check = useCallback(async () => {
    try {
      const response = await fetch('/api/live-chat/session', { credentials: 'same-origin', cache: 'no-store' });
      if (response.ok) {
        setSessionState('authenticated');
        onChange(true);
        const status = await fetch('/api/live-chat/status', { credentials: 'same-origin', cache: 'no-store' });
        setHealth(status.ok ? await status.json() as LiveHealth : null);
      } else {
        if (response.status === 503) {
          const setupResponse = await fetch('/api/live-chat/setup', { credentials: 'same-origin', cache: 'no-store' });
          const setup = setupResponse.ok ? await setupResponse.json() as { setupRequired?: boolean } : null;
          setSessionState(setup?.setupRequired ? 'setup' : 'unconfigured');
          if (setup?.setupRequired && !autoOpened.current) {
            autoOpened.current = true;
            setOpen(true);
          }
        } else {
          setSessionState(response.status === 401 ? 'unauthenticated' : 'error');
        }
        onChange(false);
        setHealth(null);
      }
    } catch {
      setSessionState('error');
      onChange(false);
      setHealth(null);
    }
  }, [onChange]);
  useEffect(() => {
    void check();
    const timer = window.setInterval(() => { if (!document.hidden) void check(); }, 30000);
    return () => window.clearInterval(timer);
  }, [check]);
  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || pending) return;
    setPending(true);
    setNotice('');
    try {
      const response = await fetch('/api/live-chat/session', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      setPassword('');
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        setNotice(response.status === 401 ? 'Nieprawidłowe hasło operatora.' :
          response.status === 429 ? 'Zbyt wiele prób. Spróbuj później.' :
          result.error?.slice(0, 180) || 'Nie udało się zestawić sesji.');
        return;
      }
      setNotice('Sesja operatora aktywna. Trwa synchronizacja czatu LIVE.');
      await check();
      window.dispatchEvent(new Event('bastilla:live-chat-auth'));
    } catch { setPassword(''); setNotice('Błąd połączenia z serwerem.'); }
    finally { setPending(false); }
  };
  const enroll = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (newPassword.length < 16 || newPassword.length > 512) {
      setNotice('Nowe hasło musi mieć od 16 do 512 znaków.');
      return;
    }
    if (newPassword !== repeatPassword) {
      setNotice('Hasła nie są identyczne.');
      return;
    }
    if (!setupCode) { setNotice('Wpisz jednorazowy kod aktywacyjny z sekretów serwera.'); return; }
    setPending(true);
    setNotice('');
    try {
      const response = await fetch('/api/live-chat/setup', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: setupCode, password: newPassword }),
      });
      setSetupCode('');
      setNewPassword('');
      setRepeatPassword('');
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        setNotice(response.status === 401 ? 'Nieprawidłowy jednorazowy kod aktywacyjny.' :
          response.status === 429 ? 'Zbyt wiele prób. Spróbuj później.' :
          response.status === 409 ? 'Hasło operatora zostało już ustawione. Odśwież sesję.' :
          response.status === 400 ? 'Nieprawidłowe hasło. Użyj 16–512 znaków.' :
          'Nie udało się zapisać hasła. Sprawdź konfigurację i trwały dysk serwera.');
        return;
      }
      setNotice('Hasło operatora ustawione. Sesja LIVE została uwierzytelniona.');
      await check();
      window.dispatchEvent(new Event('bastilla:live-chat-auth'));
    } catch {
      setSetupCode('');
      setNewPassword('');
      setRepeatPassword('');
      setNotice('Nie można połączyć się z serwerem LIVE.');
    } finally { setPending(false); }
  };
  const logout = async () => {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch('/api/live-chat/session', { method: 'DELETE', credentials: 'same-origin' });
      if (!response.ok) { setNotice('Nie udało się zakończyć sesji.'); return; }
      setPassword('');
      setNotice('Wylogowano z LIVE.');
      setSessionState('unauthenticated');
      setHealth(null);
      onChange(false);
      window.dispatchEvent(new Event('bastilla:live-chat-auth'));
    } catch { setNotice('Błąd połączenia z serwerem.'); }
    finally { setPending(false); }
  };
  const healthEntries = Object.entries(health?.agents || {});
  const onlineCount = healthEntries.filter(([, status]) => status.status === 'online').length;
  return (
    <section className="bastilla-chat-live-session relative shrink-0 border-b border-slate-800 bg-[#0a1a2b] px-2.5 py-1.5 sm:px-4" aria-label="Sesja czatu z oryginalnymi agentami LIVE">
      <div className="flex items-center gap-2">
        <span className={'h-2 w-2 shrink-0 rounded-full ' +
          (sessionState === 'authenticated' ? 'bg-emerald-400' : sessionState === 'loading' ? 'animate-pulse bg-cyan-400' : 'bg-slate-500')} />
        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-slate-300">
          {sessionState === 'authenticated' ? 'Sesja LIVE · oryginalni agenci: ' + onlineCount + '/' + Math.max(4, healthEntries.length) + ' online' :
            sessionState === 'loading' ? 'Sprawdzanie sesji agentów…' :
            sessionState === 'setup' ? 'LIVE · pierwsze ustawienie hasła' :
            sessionState === 'unconfigured' ? 'LIVE wymaga konfiguracji serwera' :
            sessionState === 'unauthenticated' ? 'LIVE wyłączony · zwykły czat jest dostępny' : 'Sesja LIVE niedostępna'}
        </span>
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-cyan-700/60 bg-cyan-950/60 px-2 py-1 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-900">
          <KeyRound className="h-3.5 w-3.5" /> {sessionState === 'authenticated' ? 'LIVE' : 'Połącz LIVE'}
        </button>
      </div>
      {open && <div className="mt-2 rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200">
        <div className="mb-2 flex items-center justify-between gap-2">
          <strong className="flex items-center gap-2 text-cyan-100">
            {sessionState === 'authenticated' ? <CheckCircle2 className="h-4 w-4 text-emerald-400"/> : <LockKeyhole className="h-4 w-4"/>}
            Uwierzytelnianie operatora w głównym czacie
          </strong>
          <button type="button" onClick={() => setOpen(false)} aria-label="Zwiń sesję LIVE" className="rounded p-1 hover:bg-slate-800"><X className="h-4 w-4"/></button>
        </div>
        {sessionState === 'authenticated' ? <>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {healthEntries.map(([agent, item]) => <div key={agent} className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5">
              <p className="font-semibold text-slate-100">{agent}</p>
              <p className={item.status === 'online' ? 'text-emerald-300' : 'text-slate-400'}>{item.status === 'online' ? 'Online' : 'Offline'}</p>
              <p className="mt-1 text-[10px] text-slate-500">W kolejce: {item.queued ?? '—'} · Wykonuje: {item.running ?? '—'}</p>
            </div>)}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={() => void check()} className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1.5 text-cyan-200"><RefreshCw className="h-3 w-3"/> Odśwież</button>
            <button type="button" onClick={() => void logout()} disabled={pending} className="flex items-center gap-1 rounded border border-rose-800 px-2 py-1.5 text-rose-200 disabled:opacity-40"><LogOut className="h-3 w-3"/> Wyloguj</button>
          </div>
        </> : sessionState === 'setup' ?
          <form onSubmit={(event) => void enroll(event)} className="grid gap-2" autoComplete="off">
            <p className="text-cyan-100 font-semibold">Pierwsze uruchomienie — ustaw własne hasło operatora</p>
            <p className="text-[11px] text-slate-400">Właściciel: ustaw jednorazowy sekret BASTILLA_LIVE_CHAT_SETUP_TOKEN na serwerze (minimum 32 losowe znaki). Nie wpisuj go w rozmowie ani w kodzie repozytorium.</p>
            <input type="password" aria-label="Jednorazowy kod aktywacyjny właściciela" autoComplete="off" value={setupCode} onChange={event => setSetupCode(event.target.value)} maxLength={512}
              className="min-w-0 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-[16px] text-white focus:border-cyan-400" placeholder="Jednorazowy kod aktywacyjny" />
            <input type="password" aria-label="Nowe hasło operatora" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} maxLength={512}
              className="min-w-0 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-[16px] text-white focus:border-cyan-400" placeholder="Nowe hasło (minimum 16 znaków)" />
            <input type="password" aria-label="Powtórz nowe hasło operatora" autoComplete="new-password" value={repeatPassword} onChange={event => setRepeatPassword(event.target.value)} maxLength={512}
              className="min-w-0 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-[16px] text-white focus:border-cyan-400" placeholder="Powtórz hasło" />
            <button type="submit" disabled={pending || !setupCode || newPassword.length < 16 || !repeatPassword}
              className="rounded-lg bg-cyan-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
              {pending ? 'Zapisywanie…' : 'Ustaw hasło i połącz LIVE'}
            </button>
          </form> : sessionState === 'unconfigured' ?
          <p className="flex items-start gap-2 text-amber-300"><ShieldAlert className="h-4 w-4 shrink-0"/> LIVE nie jest jeszcze skonfigurowany. Serwer potrzebuje BASTILLA_LIVE_CHAT_ALLOWED_ORIGIN, BASTILLA_LIVE_CHAT_SESSION_SECRET oraz dotychczasowego hasła lub kodu BASTILLA_LIVE_CHAT_SETUP_TOKEN. Sekretów nie wpisuj w czacie.</p> :
          sessionState === 'error' ?
          <div className="grid gap-2">
            <p role="alert" className="text-amber-300">Nie można sprawdzić sesji LIVE. Sprawdź dostępność API i logi serwera.</p>
            <button type="button" onClick={() => void check()} className="rounded-lg border border-slate-700 px-3 py-2 text-cyan-200">Sprawdź ponownie</button>
          </div> :
          <form onSubmit={(event) => void login(event)} className="flex flex-wrap items-center gap-2">
            <input type="password" aria-label="Hasło operatora Bastilla LIVE" autoComplete="current-password"
              value={password} onChange={(event) => setPassword(event.target.value)} maxLength={512}
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-[16px] text-white outline-none focus:border-cyan-400"
              placeholder="Hasło operatora (bez zapisywania)" />
            <button type="submit" disabled={pending || !password} className="flex items-center gap-1 rounded-lg bg-cyan-700 px-3 py-2 font-semibold text-white disabled:opacity-40">
              {pending ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <KeyRound className="h-4 w-4"/>} Zaloguj
            </button>
          </form>}
        {notice && <p role="status" className="mt-2 text-[11px] text-cyan-200">{notice}</p>}
        <p className="mt-2 text-[10px] text-slate-500">Hasło nie jest zapisywane w przeglądarce ani w historii czatu. Dostęp do agentów potwierdza serwer; sam stan sesji nie oznacza, że workery są online.</p>
      </div>}
    </section>
  );
}
