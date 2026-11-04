import React, { useEffect, useMemo, useState } from 'react';

type Message = {
  id: string;
  at: string;
  channel: string;
  sender: string;
  type: string;
  text?: string;
  read?: boolean;
  taskId?: string;
  status?: string;
  exitCode?: number;
  to?: string;
};
type AgentHealth = { status: 'online' | 'offline'; lastSeen: string | null; queued: number; running: number };
type LiveStatus = { agents: Record<string, AgentHealth>; unread: number; queue: { queued: number; running: number; failed: number } };

const API = '/api/live-chat';
const AGENTS = ['Aria', 'Alex', 'Astyria', 'Aurelius'];
const CHANNELS = ['Wszyscy', ...AGENTS];

export default function LiveAgentChat() {
  const [auth, setAuth] = useState<'checking' | 'authenticated' | 'login' | 'disabled'>('checking');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [channel, setChannel] = useState('Wszyscy');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState('');
  const [connection, setConnection] = useState('Sprawdzanie sesji');
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [sending, setSending] = useState(false);
  const [lastQueued, setLastQueued] = useState<Array<{id:string;agent:string;status:string}>>([]);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityAgent, setActivityAgent] = useState('Wszyscy');
  const [notificationPermission, setNotificationPermission] = useState<string>('default');

  useEffect(() => {
    let active = true;
    fetch(API + '/session', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => {
        if (!active) return;
        if (response.ok) setAuth('authenticated');
        else if (response.status === 503) setAuth('disabled');
        else setAuth('login');
      })
      .catch(() => { if (active) setAuth('login'); });
    if (typeof Notification !== 'undefined') setNotificationPermission(Notification.permission);
    else setNotificationPermission('unsupported');
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (auth !== 'authenticated') return;
    let active = true;
    let stream: EventSource | null = null;
    let statusTimer = 0;

    const refreshStatus = async () => {
      try {
        const response = await fetch(API + '/status', { credentials: 'same-origin', cache: 'no-store' });
        if (response.status === 401) { if (active) setAuth('login'); return; }
        if (!response.ok) throw new Error('Status HTTP ' + response.status);
        const data = await response.json() as LiveStatus;
        if (active) setStatus(data);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Nie udało się pobrać statusu.');
      }
    };

    const start = async () => {
      setLoadingMessages(true);
      setConnection('Ładowanie rozmowy');
      try {
        const [historyResponse, statusResponse] = await Promise.all([
          fetch(API + '/history?channel=Wszyscy', { credentials: 'same-origin', cache: 'no-store' }),
          fetch(API + '/status', { credentials: 'same-origin', cache: 'no-store' }),
        ]);
        if (!active) return;
        if (historyResponse.status === 401 || statusResponse.status === 401) { setLoadingMessages(false); setAuth('login'); return; }
        if (historyResponse.status === 503 || statusResponse.status === 503) { setLoadingMessages(false); setAuth('disabled'); return; }
        if (!historyResponse.ok || !statusResponse.ok) throw new Error('Nie udało się pobrać historii czatu.');
        const history = await historyResponse.json() as { messages: Message[] };
        const statusData = await statusResponse.json() as LiveStatus;
        if (!active) return;
        setMessages(Array.isArray(history.messages) ? history.messages : []);
        setStatus(statusData);
        setLoadingMessages(false);
        const lastId = history.messages?.length ? history.messages[history.messages.length - 1].id : '';
        const suffix = lastId ? '?after=' + encodeURIComponent(lastId) : '';
        stream = new EventSource(API + '/events' + suffix, { withCredentials: true });
        stream.onopen = () => { if (active) { setConnection('Połączono na żywo'); setError(''); } };
        stream.onerror = () => { if (active) setConnection('Połączenie przerwane — ponawianie'); };
        stream.onmessage = (event) => {
          try {
            const item = JSON.parse(event.data) as Message;
            if (!active) return;
            setMessages((previous) => previous.some((message) => message.id === item.id)
              ? previous
              : [...previous, item].slice(-2000));
            if (item.sender !== 'user') {
              setToast('Nowa wiadomość od ' + item.sender);
              if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                try {
                  const notification = new Notification('Bastilla · ' + item.sender, {
                    body: (item.text || item.type).slice(0, 180),
                    tag: 'bastilla-live-' + item.id,
                  });
                  notification.onclick = () => window.focus();
                } catch {
                  // Browser notification permission can be revoked while the page is open.
                }
              }
            }
          } catch {
            setError('Otrzymano nieprawidłowe zdarzenie czatu.');
          }
        };
        statusTimer = window.setInterval(() => { void refreshStatus(); }, 15000);
        setConnection('Oczekiwanie na wiadomości');
      } catch (cause) {
        if (active) {
          setLoadingMessages(false);
          setConnection('Błąd połączenia');
          setError(cause instanceof Error ? cause.message : 'Nie udało się połączyć z czatem.');
        }
      }
    };

    void start();
    return () => {
      active = false;
      stream?.close();
      if (statusTimer) window.clearInterval(statusTimer);
    };
  }, [auth]);

  const activityEvents = useMemo(() => messages.filter((item) =>
    item.type === 'terminal' || item.type === 'progress' || item.type === 'status' ||
    item.type === 'task' || item.type === 'error'
  ).filter((item) => activityAgent === 'Wszyscy' || item.sender === activityAgent).slice(-80).reverse(), [messages, activityAgent]);

  // "Wszyscy" is the global feed; agent tabs also show direct agent replies and
  // messages addressed to that agent from the global conversation.
  const visibleMessages = useMemo(() => channel === 'Wszyscy'
    ? messages
    : messages.filter((message) =>
        message.channel === channel ||
        (message.channel === 'Wszyscy' && (message.sender === channel || message.to === channel))
      ), [channel, messages]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      const response = await fetch(API + '/session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Logowanie nie powiodło się.');
      setPassword('');
      setAuth('authenticated');
    } catch (cause) {
      setLoginError(cause instanceof Error ? cause.message : 'Logowanie nie powiodło się.');
    } finally {
      setLoggingIn(false);
    }
  }

  async function logout() {
    try {
      await fetch(API + '/session', { method: 'DELETE', credentials: 'same-origin' });
    } finally {
      setMessages([]);
      setStatus(null);
      setAuth('login');
      setConnection('Wylogowano');
    }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const response = await fetch(API + '/messages', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, text: draft.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Nie udało się wysłać wiadomości.');
      if (data.event) {
        setMessages((previous) => previous.some((message) => message.id === data.event.id)
          ? previous
          : [...previous, data.event].slice(-2000));
      }
      setDraft('');
      setLastQueued(Array.isArray(data.queued) ? data.queued : []);
      setToast('Wiadomość dodana do trwałej kolejki: ' + (data.queuedFor || []).join(', '));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nie udało się wysłać wiadomości.');
    } finally {
      setSending(false);
    }
  }

  async function markRead(id: string) {
    try {
      const response = await fetch(API + '/messages/' + encodeURIComponent(id) + '/read', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Nie udało się oznaczyć wiadomości.');
      setMessages((previous) => previous.map((message) => message.id === id ? { ...message, read: true } : message));
      void refreshStatusAfterRead();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nie udało się oznaczyć wiadomości.');
    }
  }

  async function refreshStatusAfterRead() {
    const response = await fetch(API + '/status', { credentials: 'same-origin', cache: 'no-store' });
    if (response.ok) setStatus(await response.json() as LiveStatus);
  }

  async function enableNotifications() {
    if (typeof Notification === 'undefined') {
      setToast('Ta przeglądarka nie obsługuje powiadomień systemowych.');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }

  if (auth === 'checking') {
    return <section aria-label="Czat agentów" role="status" aria-live="polite" style={{ padding: 20, color: '#e2e8f0' }}>Sprawdzanie sesji operatora…</section>;
  }

  if (auth === 'disabled') {
    return <section aria-label="Czat agentów" style={{ padding: 20, color: '#e2e8f0' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700 }}>Bastilla · AI Chat</h2>
      <p>Autoryzacja czatu nie została skonfigurowana na serwerze. Ustaw BASTILLA_LIVE_CHAT_ALLOWED_ORIGIN, BASTILLA_LIVE_CHAT_USER_PASSWORD i BASTILLA_LIVE_CHAT_SESSION_SECRET.</p>
    </section>;
  }

  if (auth === 'login') {
    return <section aria-label="Logowanie do czatu agentów" style={{ padding: 20, color: '#e2e8f0', background: '#0f172a', borderRadius: 12 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700 }}>Bastilla · Prywatny czat agentów</h2>
      <p style={{ color: '#94a3b8' }}>Zaloguj się hasłem operatora. Sesja jest przechowywana w bezpiecznym ciasteczku HttpOnly.</p>
      <form onSubmit={login} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input aria-label="Hasło operatora" type="password" autoComplete="current-password" value={password}
          onChange={(event) => setPassword(event.target.value)} style={{ flex: 1, minWidth: 180, padding: 12, borderRadius: 8, background: '#1e293b', color: 'white', border: '1px solid #475569' }} />
        <button type="submit" disabled={!password || loggingIn} style={{ padding: 12, borderRadius: 8, background: '#2563eb', color: 'white' }}>{loggingIn ? 'Logowanie…' : 'Zaloguj'}</button>
      </form>
      {loginError && <p role="alert" style={{ color: '#fca5a5' }}>{loginError}</p>}
    </section>;
  }

  const connectionTone = connection === 'Połączono na żywo'
    ? 'is-connected'
    : connection.includes('ponawianie') || connection === 'Ładowanie rozmowy'
      ? 'is-pending'
      : connection === 'Błąd połączenia'
        ? 'is-error'
        : '';

  return <section className="bastilla-live-workspace" aria-label="Czat agentów" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: '#0f172a', color: '#f8fafc', borderRadius: 12, overflow: 'hidden' }}>
    <header className="bastilla-live-header" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderBottom: '1px solid #334155' }}>
      <div className="bastilla-live-heading">
        <strong>Bastilla · AI Chat</strong>
        <div className={`bastilla-live-connection ${connectionTone}`} role="status" aria-live="polite" aria-atomic="true">
          <span className="bastilla-live-connection-label">{connection}</span>
          <span className="bastilla-live-unread">Nieprzeczytane: {status?.unread ?? 0}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {typeof Notification !== 'undefined' && <button type="button" onClick={enableNotifications} disabled={notificationPermission === 'granted'} style={{ padding: 8, borderRadius: 8, background: '#334155', color: 'white' }}>
          {notificationPermission === 'granted' ? 'Powiadomienia włączone' : 'Włącz powiadomienia'}
        </button>}
        <button type="button" onClick={logout} style={{ padding: 8, borderRadius: 8, background: '#334155', color: 'white' }}>Wyloguj</button>
      </div>
    </header>
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: 8, borderBottom: '1px solid #334155' }}>
      {AGENTS.map((name) => {
        const health = status?.agents?.[name];
        return <span key={name} style={{ flex: '0 0 auto', fontSize: 11, padding: 6, borderRadius: 7, background: health?.status === 'online' ? '#064e3b' : '#334155', color: '#e2e8f0' }}>
          {name}: {health?.status === 'online' ? 'WORKER ONLINE' : 'WORKER OFFLINE'} · kolejka {health?.queued ?? 0}
        </span>;
      })}
    </div>
    <p style={{ padding: '0 10px', margin: 0, color: '#94a3b8', fontSize: 10 }}>ONLINE oznacza świeży heartbeat workera, nie potwierdza jeszcze odpowiedzi modelu agenta.</p>
    <section className="bastilla-live-activity" aria-label="Aktywność agentów na żywo" style={{ borderBottom: '1px solid #334155', padding: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <strong>Aktywność SI · terminal i zadania LIVE</strong>
        <button type="button" aria-expanded={activityOpen} onClick={() => setActivityOpen((value) => !value)}
          style={{ background: '#334155', color: 'white', border: 0, borderRadius: 7, padding: 8 }}>
          {activityOpen ? 'Zwiń' : 'Rozwiń'}
        </button>
      </div>
      {activityOpen && <>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '8px 0' }}>
          {CHANNELS.map((name) => <button key={name} type="button" aria-pressed={activityAgent === name}
            onClick={() => setActivityAgent(name)} style={{ padding: 6, background: activityAgent === name ? '#2563eb' : '#334155', color: 'white', border: 0, borderRadius: 6 }}>{name}</button>)}
        </div>
        <div role="status" style={{ fontSize: 12, color: '#cbd5e1' }}>
          Zadania w kolejce: {status?.queue?.queued ?? '—'} · wykonywane: {status?.queue?.running ?? '—'} · nieudane: {status?.queue?.failed ?? '—'}
        </div>
        <div role="log" aria-live="polite" aria-label="Zdarzenia z rzeczywistych workerów" style={{ maxHeight: 210, overflowY: 'auto', background: '#020617', padding: 10, marginTop: 8, borderRadius: 8, fontFamily: 'monospace', fontSize: 12 }}>
          {activityEvents.length === 0
            ? <span style={{ color: '#94a3b8' }}>Brak potwierdzonych zdarzeń pracy. Panel nie symuluje aktywności.</span>
            : activityEvents.map((item) => <div key={item.id} style={{ marginBottom: 8, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
              <span style={{ color: '#93c5fd' }}>[{new Date(item.at).toLocaleTimeString('pl-PL')}] {item.sender} · {item.type}{item.taskId ? ' · ' + item.taskId : ''}{item.status ? ' · ' + item.status : ''}</span>
              <div>{item.text || '(zdarzenie bez treści)'}</div>
            </div>)}
        </div>
        <small style={{ color: '#94a3b8' }}>Widoczne są wyłącznie zdarzenia odebrane z backendu. To nie jest dostęp do powłoki ani dowód działania modelu bez weryfikacji agenta.</small>
      </>}
    </section>
    <nav className="bastilla-live-channels" aria-label="Kanały rozmowy" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: 8 }}>
      {CHANNELS.map((name) => <button key={name} type="button" aria-pressed={channel === name} onClick={() => setChannel(name)}
        style={{ padding: 9, background: channel === name ? '#2563eb' : '#334155', color: 'white', border: 0, borderRadius: 7, flex: '0 0 auto' }}>{name}</button>)}
    </nav>
    <div className="bastilla-live-messages" role="log" aria-label={`Wiadomości · ${channel}`} aria-live="polite" aria-relevant="additions text" aria-atomic="false" style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
      {loadingMessages && <p className="bastilla-live-placeholder" role="status" aria-live="polite">Ładowanie historii rozmowy…</p>}
      {!loadingMessages && visibleMessages.length === 0 && <p className="bastilla-live-placeholder">Nie ma jeszcze wiadomości w kanale „{channel}”. Napisz poniżej, aby rozpocząć rozmowę.</p>}
      {visibleMessages.map((item) => <article className={item.sender === 'user' ? 'bastilla-chat-bubble bastilla-chat-bubble-user' : 'bastilla-chat-bubble'} key={item.id} style={{ background: '#1e293b', padding: 12, marginBottom: 8, borderRadius: 8, border: '1px solid #334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <strong>{item.sender === 'user' ? 'Ty' : item.sender}</strong>
          <time dateTime={item.at} style={{ color: '#94a3b8' }}>{new Date(item.at).toLocaleTimeString('pl-PL')}</time>
        </div>
        {item.type === 'terminal'
          ? <div><small>Terminal {item.taskId || ''} · {item.status || 'zdarzenie'}</small><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.text}</pre></div>
          : <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.text || item.type}</p>}
        {item.sender !== 'user' && !item.read && <button type="button" onClick={() => void markRead(item.id)} style={{ padding: 6, borderRadius: 6, background: '#334155', color: 'white', fontSize: 11 }}>Oznacz jako przeczytane</button>}
      </article>)}
    </div>
    {lastQueued.length > 0 && <div role="status" style={{ padding: '6px 12px', fontSize: 12, color: '#cbd5e1' }}>
      Ostatnio przyjęte zadania: {lastQueued.map((job) => job.agent + ' (' + job.status + ')').join(' · ')}.
      Status „queued” oznacza przyjęcie do kolejki, nie wykonanie przez SI.
    </div>}
    {toast && <div role="status" style={{ padding: 8, background: '#1d4ed8', color: 'white' }}>
      {toast} <button type="button" onClick={() => setToast('')} style={{ marginLeft: 8, textDecoration: 'underline' }}>Zamknij</button>
    </div>}
    {error && <p role="alert" style={{ padding: 8, color: '#fca5a5' }}>{error}</p>}
    <form className="bastilla-live-composer" onSubmit={send} style={{ display: 'flex', padding: 12, gap: 8, borderTop: '1px solid #334155' }}>
      <label className="bastilla-sr-only" htmlFor="bastilla-live-message">Wiadomość do {channel}</label>
      <div className="bastilla-live-composer-fields">
        <textarea id="bastilla-live-message" aria-describedby="bastilla-live-composer-help" rows={2} value={draft} maxLength={8000} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
          placeholder={'Napisz do ' + channel} style={{ flex: 1, minWidth: 0, padding: 12, background: '#334155', color: 'white', border: 0, borderRadius: 8 }} />
        <button type="submit" disabled={sending || !draft.trim()} aria-busy={sending} style={{ background: '#2563eb', color: 'white', padding: 12, border: 0, borderRadius: 8 }}>{sending ? 'Wysyłanie…' : 'Wyślij'}</button>
      </div>
      <small id="bastilla-live-composer-help" className="bastilla-live-composer-help">Enter wysyła · Shift+Enter dodaje nowy wiersz</small>
    </form>
  </section>;
}
