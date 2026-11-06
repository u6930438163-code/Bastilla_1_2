import React, { useEffect, useRef, useState } from 'react';
import { DataStore, OPERATOR_NAME } from '../kernel/svlKernel';
import { SYSTEM_AGENTS, AgentProfile } from '../kernel/agents';
import { Sparkles, ShieldCheck, RefreshCw, Image as ImageIcon, FileText, MessagesSquare, Paperclip, Send, X, SlidersHorizontal, Maximize2, Minimize2, BarChart3, Clapperboard, Code2, Copy, Download, Reply, ThumbsDown, ThumbsUp } from 'lucide-react';
import { WorkChatMessage, WorkChatDemo } from './WorkChatMessage';
import { TerminalWorkCard, type TerminalCardEntry, type TerminalCardStatus } from './TerminalWorkCard';
import { WorkspaceCommandCenter } from './WorkspaceCommandCenter';
import { LiveWorkspaceSession } from './LiveWorkspaceSession';
import {
  ASTYRIA_MISSION_ACTIONS,
  ASTYRIA_MISSION_LABELS,
  AGENT_PROTOCOL_COMMANDS,
  AGENT_PROTOCOL_LABELS,
  AstyriaMissionAction,
  AgentProtocolCommand,
  AgentProtocolReply,
  AgentProtocolRequest,
} from '../kernel/agentProtocol';
import {
  CHAT_ATTACHMENT_ACCEPT,
  ChatAttachment,
  MAX_CHAT_ATTACHMENTS,
  formatChatMessage,
  readChatAttachmentFile,
  validateChatAttachments,
} from '../kernel/chatAttachments';

interface AgentCommsViewProps {
  dataStore: DataStore;
  streamingChat?: {
    prompt: string;
    agents: Array<{ agent: string; text: string; status: 'writing' | 'done' | 'error' }>;
  } | null;
  onSendProtocol: (request: AgentProtocolRequest) => Promise<AgentProtocolReply | undefined>;
  onSendMessage: (
    message: string,
    agent: 'triad' | 'Alex' | 'Astyria' | 'Aurelius' | 'si_1',
    attachments?: ChatAttachment[],
    freedomMode?: boolean,
  ) => Promise<void>;
  onRunAstyriaMission: (action: AstyriaMissionAction) => Promise<void>;
  isLoading: boolean;
  sendError?: string | null;
  onClearHistory: () => void;
  onRunKernelCommand?: (command: string) => Promise<{ output: string; state?: unknown }>;
  onOpenTerminal?: () => void;
  preparedDraft?: { id: number; text: string; agent: 'triad' | 'Alex' | 'Astyria' | 'Aurelius' | 'si_1' } | null;
  onForceSync?: () => void;
  onTriggerFreeVoice?: (
    agent?: 'triad' | 'Alex' | 'Astyria' | 'Aurelius' | 'si_1',
    topicHint?: string,
    allowSilenceAll?: boolean,
  ) => Promise<{
    skipped: boolean;
    spokenAgents: string[];
    spokenCount?: number;
    silentAgents?: string[];
    messages?: Array<{ agent: string; tekst: string }>;
  }>;
  onTriggerInitiative?: () => Promise<void>;
  onUnclog?: () => void;
  onRestoreBackup?: () => void;
}

const TWO_WAY_STORAGE_KEY = 'bastilla_two_way_chat_enabled';
const FREEDOM_STORAGE_KEY = 'bastilla_ai_freedom_enabled';
const REACTION_STORAGE_KEY = 'bastilla_chat_message_reactions_v1';
type LiveChatEvent = { id: string; type: string; channel: string; sender: string; text: string; at: string };
function validLiveEvent(value: unknown): value is LiveChatEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return ['id', 'type', 'channel', 'sender', 'text', 'at'].every((key) =>
    typeof event[key] === 'string' && (event[key] as string).length <= 100000);
}

export const AgentCommsView: React.FC<AgentCommsViewProps> = ({
  dataStore,
  streamingChat,
  onSendProtocol,
  onSendMessage,
  onRunAstyriaMission,
  isLoading,
  sendError,
  onClearHistory,
  onRunKernelCommand,
  onOpenTerminal,
  preparedDraft,
  onForceSync,
  onTriggerFreeVoice,
}) => {
  const [selectedTarget, setSelectedTarget] = useState<'triad' | 'Alex' | 'Astyria' | 'Aurelius' | 'si_1'>('triad');
  const [selectedCommand, setSelectedCommand] = useState<AgentProtocolCommand>('SYSTEM_STATUS');
  const [signal, setSignal] = useState('');
  const [omega, setOmega] = useState('');
  const [time, setTime] = useState('');
  const [selectedMissionAction, setSelectedMissionAction] = useState<AstyriaMissionAction>('deep_scan');
  const [messageText, setMessageText] = useState('');
  const [chatAttachments, setChatAttachments] = useState<ChatAttachment[]>([]);
  const [sentImageHistory, setSentImageHistory] = useState<Array<{ message: string; images: ChatAttachment[] }>>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [showProtocolTools, setShowProtocolTools] = useState(false);
  const [showWorkPreview, setShowWorkPreview] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [freedomEnabled, setFreedomEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem(FREEDOM_STORAGE_KEY) !== 'false'; } catch { return true; }
  });
  const [terminalCardVisible, setTerminalCardVisible] = useState(false);
  const [terminalCardCommand, setTerminalCardCommand] = useState('');
  const [terminalCardStatus, setTerminalCardStatus] = useState<TerminalCardStatus>('idle');
  const [terminalCardEntries, setTerminalCardEntries] = useState<TerminalCardEntry[]>([]);
  const [workNotice, setWorkNotice] = useState<string | null>(null);
  const [liveAuthenticated, setLiveAuthenticated] = useState(false);
  const [liveMode, setLiveMode] = useState(true);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveEvents, setLiveEvents] = useState<LiveChatEvent[]>([]);

  const [messageReactions, setMessageReactions] = useState<Record<string, 'up' | 'down'>>(() => {
    try {
      const raw = localStorage.getItem(REACTION_STORAGE_KEY);
      const stored: unknown = raw ? JSON.parse(raw) : {};
      if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
      return Object.fromEntries(Object.entries(stored).filter(([, value]) => value === 'up' || value === 'down')) as Record<string, 'up' | 'down'>;
    } catch { return {}; }
  });
  const [isFullViewport, setIsFullViewport] = useState(false);
  const [twoWayEnabled, setTwoWayEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(TWO_WAY_STORAGE_KEY);
      return saved !== 'false';
    } catch {
      return false;
    }
  });
  const [freeVoiceNotice, setFreeVoiceNotice] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const followLatestMessagesRef = useRef(true);
  const handleTerminalCommand = async (rawCommand: string) => {
    const command = rawCommand.trim();
    // Embedded card only accepts known read-only commands. Advanced commands remain
    // accessible in the separate full terminal with the backend's own restrictions.
    const allowed = /^(status|report|agents|config|history|root status|infra status)$/i.test(command);
    if (!allowed) {
      setWorkNotice('W karcie czatu dostępne są tylko polecenia odczytu: status, report, agents, config, history, root status, infra status. Inne wykonaj w pełnym terminalu.');
      return;
    }
    if (!onRunKernelCommand || terminalCardStatus === 'running') {
      setWorkNotice('Brak dostępnego połączenia z jądrem lub terminal jest zajęty.');
      return;
    }
    setTerminalCardCommand(command);
    setTerminalCardStatus('running');
    setTerminalCardEntries(old => [...old, { type: 'input' as const, text: '$ ' + command, time: new Date().toLocaleTimeString('pl-PL') }].slice(-100));
    try {
      const response = await onRunKernelCommand(command);
      if (!response || typeof response.output !== 'string') throw new Error('Serwer nie zwrócił wyniku polecenia.');
      setTerminalCardEntries(old => [...old, {
        type: 'output' as const, text: response.output, time: new Date().toLocaleTimeString('pl-PL'),
      }].slice(-100));
      setTerminalCardStatus('success');
    } catch (cause) {
      setTerminalCardEntries(old => [...old, {
        type: 'error' as const, text: cause instanceof Error ? cause.message : 'Błąd backendu terminala.',
        time: new Date().toLocaleTimeString('pl-PL'),
      }].slice(-100));
      setTerminalCardStatus('error');
    }
  };

  const setReaction = (key: string, value: 'up' | 'down') => {
    setMessageReactions((current) => {
      const next = { ...current };
      if (next[key] === value) delete next[key];
      else next[key] = value;
      try { localStorage.setItem(REACTION_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const exportConversation = () => {
    const transcript = dataStore.chat_history.map((message, index) =>
      String(index + 1) + '. [' + (message.agent === 'si_1' ? 'Aria' : message.agent) + ']\n' + message.tekst
    ).join('\n\n---\n\n');
    const url = URL.createObjectURL(new Blob([transcript], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'bastilla-czat-' + new Date().toISOString().slice(0, 10) + '.txt';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setWorkNotice('Wyeksportowano historię tekstową czatu na urządzenie.');
  };

  const prepareWorkPrompt = (text: string) => {
    const prompt = text.slice(0, 20_500);
    setMessageText(prompt);
    setWorkNotice('Polecenie przygotowane. Możesz je edytować i wysłać do wybranego agenta.');
    window.requestAnimationFrame(() => chatInputRef.current?.focus());
  };

  useEffect(() => {
    if (!preparedDraft) return;
    setSelectedTarget(preparedDraft.agent);
    setMessageText(preparedDraft.text.slice(0, 20_500));
    setWorkNotice('Zgłoszenie diagnostyczne przygotowane w głównym czacie. Zatwierdź przyciskiem Wyślij.');
    window.requestAnimationFrame(() => chatInputRef.current?.focus());
  }, [preparedDraft?.id]);

  // One real worker transport, shown within the existing conversation rather than a
  // second floating chat. GET /history includes all channels when channel=Wszyscy.
  useEffect(() => {
    if (!liveAuthenticated) { setLiveEvents([]); return; }
    let disposed = false;
    const refreshLive = async () => {
      try {
        const response = await fetch('/api/live-chat/history?channel=Wszyscy', { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok || disposed) return;
        const result = await response.json() as { messages?: unknown };
        if (Array.isArray(result.messages)) {
          const events = result.messages.filter(validLiveEvent).slice(-200);
          if (!disposed) setLiveEvents(events);
        }
      } catch { /* The session panel shows connection health. */ }
    };
    void refreshLive();
    const stream = new EventSource('/api/live-chat/events', { withCredentials: true });
    stream.onmessage = (event) => {
      try {
        const item: unknown = JSON.parse(event.data);
        if (!disposed && validLiveEvent(item)) {
          setLiveEvents((current) => current.some((entry) => entry.id === item.id)
            ? current : [...current, item].slice(-200));
        }
      } catch { /* Malformed events are ignored. */ }
    };
    const onWorkspaceEvent = () => { void refreshLive(); };
    window.addEventListener('bastilla:workspace-event', onWorkspaceEvent);
    const timer = window.setInterval(() => { if (!document.hidden) void refreshLive(); }, 10000);
    return () => {
      disposed = true;
      stream.close();
      window.clearInterval(timer);
      window.removeEventListener('bastilla:workspace-event', onWorkspaceEvent);
    };
  }, [liveAuthenticated]);

  const transmissionStatus = sendError
    ? { label: 'BŁĄD', color: 'rose' }
    : isLoading
    ? { label: 'AKTYWNY', color: 'cyan' }
    : { label: 'GOTOWY', color: 'emerald' };

  // Map each sent image batch to its corresponding operator message index in chat_history
  const sentImagesByMessageIndex = React.useMemo(() => {
    const map = new Map<number, ChatAttachment[]>();
    const usedIndices = new Set<number>();
    for (let i = sentImageHistory.length - 1; i >= 0; i--) {
      const entry = sentImageHistory[i];
      for (let idx = dataStore.chat_history.length - 1; idx >= 0; idx--) {
        if (usedIndices.has(idx)) continue;
        const msg = dataStore.chat_history[idx];
        if (
          (msg.agent === OPERATOR_NAME || msg.agent === 'Operator') &&
          msg.tekst === entry.message
        ) {
          map.set(idx, entry.images);
          usedIndices.add(idx);
          break;
        }
      }
    }
    return map;
  }, [dataStore.chat_history, sentImageHistory]);

  // Identify which messages in chat_history were initiated spontaneously by AI (without a preceding Operator prompt)
  const spontaneousAgentMessageIndices = React.useMemo(() => {
    const spontaneous = new Set<number>();
    let awaitingReplyAgents = new Set<string>();
    for (let idx = 0; idx < dataStore.chat_history.length; idx++) {
      const msg = dataStore.chat_history[idx];
      const isOp = msg.agent === OPERATOR_NAME || msg.agent === 'Operator';
      if (isOp) {
        awaitingReplyAgents = new Set(['Alex', 'Astyria', 'Aurelius', 'si_1', 'Aria']);
      } else {
        if (awaitingReplyAgents.has(msg.agent)) {
          awaitingReplyAgents.delete(msg.agent);
        } else {
          spontaneous.add(idx);
        }
      }
    }
    return spontaneous;
  }, [dataStore.chat_history]);

  useEffect(() => {
    try {
      localStorage.setItem(TWO_WAY_STORAGE_KEY, String(twoWayEnabled));
    } catch {}
  }, [twoWayEnabled]);

  // Synchronize real inbound messages. A browser timer never triggers
  // artificial "spontaneous" model responses.
  useEffect(() => {
    let active = true;
    void fetch('/api/agents/channel/status', { cache: 'no-store' })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (active && typeof data?.enabled === 'boolean') setTwoWayEnabled(data.enabled); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const toggleTwoWay = async () => {
    const next = !twoWayEnabled;
    try {
      const response = await fetch('/api/agents/channel/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const value = await response.json();
      setTwoWayEnabled(Boolean(value.enabled));
      setFreeVoiceNotice(next
        ? 'Kanał obustronny aktywny: oczekiwanie na wiadomości agentów.'
        : 'Kanał spontanicznych wiadomości wstrzymany na serwerze.');
    } catch {
      setFreeVoiceNotice('Nie można zmienić trybu; sprawdź połączenie z serwerem.');
    }
  };

  useEffect(() => {
    if (!twoWayEnabled || !onForceSync) return;
    let active = true;
    const sync = async () => {
      if (!active || isLoading) return;
      try {
        const res = await fetch('/api/kernel/state?fresh=1', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const length = Array.isArray(data?.store?.chat_history) ? data.store.chat_history.length : 0;
        if (active && length !== dataStore.chat_history.length) onForceSync();
      } catch { /* Offline does not mean an agent has spoken. */ }
    };
    const timer = setInterval(() => { void sync(); }, 3500);
    return () => { active = false; clearInterval(timer); };
  }, [twoWayEnabled, onForceSync, isLoading, dataStore.chat_history.length]);

  useEffect(() => {
    try { localStorage.setItem(FREEDOM_STORAGE_KEY, String(freedomEnabled)); } catch {}
  }, [freedomEnabled]);

  const handleRequestFreeVoice = async () => {
    if (isLoading || !onTriggerFreeVoice) return;
    setFreeVoiceNotice(null);
    const optionalHint = messageText.trim();
    try {
      const res = await onTriggerFreeVoice(selectedTarget, optionalHint || undefined, false);
      if (optionalHint) {
        setMessageText('');
      }
      if (res.skipped || res.spokenAgents.length === 0) {
        setFreeVoiceNotice('Agenci skorzystali z prawa do ciszy (brak przymusu odpowiedzi).');
      } else {
        const names = res.spokenAgents.map((a) => (a === 'si_1' ? 'Aria' : a)).join(', ');
        setFreeVoiceNotice(`Swobodny głos zabrał(a): ${names}`);
      }
    } catch {
      // Errors are surfaced via sendError
    }
  };

  useEffect(() => {
    const chatScroll = chatScrollRef.current;
    if (chatScroll && followLatestMessagesRef.current) {
      chatScroll.scrollTop = chatScroll.scrollHeight;
    }
  }, [dataStore.chat_history.length, isLoading, streamingChat]);

  const handleSendProtocol = async () => {
    if (isLoading) return;
    const payload = selectedCommand === 'SIGNAL_ANALYSIS'
      ? {
          ...(signal.trim() ? { signal: signal.trim() } : {}),
          ...(omega !== '' ? { omega: Number(omega) } : {}),
          ...(time !== '' ? { time: Number(time) } : {}),
        }
      : undefined;

    try {
      await onSendProtocol({
        command: selectedCommand,
        agent: selectedTarget,
        ...(payload && Object.keys(payload).length > 0 ? { payload } : {}),
      });
    } catch {
      // The parent exposes protocol errors in the chat status.
    }
  };

  const handleRunAstyriaMission = async () => {
    if (isLoading) return;
    setSelectedTarget('Astyria');
    try {
      await onRunAstyriaMission(selectedMissionAction);
    } catch {
      // The parent exposes mission errors in the chat status.
    }
  };

  const handleSendMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = messageText.startsWith('/propose write-file ')
      ? messageText
      : messageText.trim();
    if ((!message && chatAttachments.length === 0) || isLoading || liveBusy) return;
    const attachmentsSnapshot = [...chatAttachments];
    if (liveAuthenticated && liveMode) {
      if (attachmentsSnapshot.length) {
        setWorkNotice('Kanał workerów LIVE przyjmuje aktualnie tylko tekst. Przełącz na Modele LLM, aby wysłać załączniki.');
        return;
      }
      if (!message || message.length > 8000) {
        setWorkNotice('Kanał LIVE przyjmuje tekst o długości od 1 do 8000 znaków.');
        return;
      }
      setLiveBusy(true);
      try {
        const channel = selectedTarget === 'triad' ? 'Wszyscy' : selectedTarget === 'si_1' ? 'Aria' : selectedTarget;
        const response = await fetch('/api/live-chat/messages', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, text: message }),
        });
        const result = await response.json() as { error?: string; event?: LiveChatEvent; queuedFor?: string[] };
        if (!response.ok) throw new Error(result.error || 'Serwer LIVE odrzucił wiadomość.');
        if (result.event && validLiveEvent(result.event)) {
          setLiveEvents((current) => current.some((item) => item.id === result.event!.id)
            ? current : [...current, result.event!].slice(-200));
        }
        setWorkNotice('Przyjęto do kolejki agentów: ' + (result.queuedFor || []).join(', ') + '. To nie oznacza wykonania zadania.');
        setMessageText('');
        setChatAttachments([]);
        setAttachmentError(null);
      } catch (cause) {
        setWorkNotice('Błąd LIVE: ' + (cause instanceof Error ? cause.message : 'brak odpowiedzi serwera'));
      } finally {
        setLiveBusy(false);
      }
      return;
    }
    try {
      await onSendMessage(message, selectedTarget, attachmentsSnapshot, freedomEnabled);
      const images = attachmentsSnapshot.filter((attachment) => attachment.mimeType?.startsWith('image/'));
      if (images.length > 0) {
        setSentImageHistory((prev) => [
          ...prev,
          { message: formatChatMessage(message, attachmentsSnapshot), images },
        ]);
      }
      setMessageText('');
      setChatAttachments([]);
      setAttachmentError(null);
      setWorkNotice(null);
    } catch {
      // The parent exposes transmission errors in the chat status.
    }
  };

  const handleAttachmentSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    setAttachmentError(null);
    if (files.length === 0) return;
    if (chatAttachments.length + files.length > MAX_CHAT_ATTACHMENTS) {
      setAttachmentError(`Możesz dołączyć maksymalnie ${MAX_CHAT_ATTACHMENTS} pliki.`);
      return;
    }
    let incoming: ChatAttachment[];
    try {
      incoming = await Promise.all(files.map(readChatAttachmentFile));
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : 'Nie udało się odczytać wybranego pliku.');
      return;
    }
    const validation = validateChatAttachments([...chatAttachments, ...incoming]);
    if (!validation.valid) {
      setAttachmentError(validation.error);
      return;
    }
    setChatAttachments(validation.attachments);
  };

  return (
    <div
      className={`${
        isFullViewport ? 'fixed inset-0 z-50 h-dvh w-screen' : 'relative h-full w-full flex-1'
      } flex min-h-0 min-w-0 flex-col overflow-hidden bg-slate-950 font-mono text-xs cyber-grid`}
    >
      {/* Ultra-compact Single-Line Top Bar */}
      <div className="bg-slate-900/95 backdrop-blur-md border-b border-cyan-500/30 px-2 sm:px-4 py-1.5 flex items-center justify-between gap-1.5 shadow-sm shrink-0">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span
            title={`Status: ${transmissionStatus.label}`}
            className={`w-2 h-2 shrink-0 rounded-full ${
              transmissionStatus.color === 'rose'
                ? 'bg-rose-400 shadow-[0_0_8px_#fb7185]'
                : transmissionStatus.color === 'cyan'
                ? 'bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]'
                : 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
            }`}
          />
          <select
            aria-label="Cel transmisji"
            value={selectedTarget}
            onChange={(event) => setSelectedTarget(event.target.value as typeof selectedTarget)}
            disabled={isLoading}
            className="min-w-[104px] flex-1 max-w-xs rounded-lg border border-cyan-500/40 bg-slate-950 px-2 py-1 text-[11px] sm:text-xs font-semibold text-cyan-100 outline-none transition focus:border-cyan-400 disabled:opacity-50"
          >
            <option value="triad">Triada · Wszyscy agenci</option>
            <option value="Alex">Alex · Architektura & Backend</option>
            <option value="Astyria">Astyria · UI & Mobile</option>
            <option value="Aurelius">Aurelius · Bezpieczeństwo</option>
            <option value="si_1">Aria · Modele AI & MCP</option>
          </select>
          <span className="hidden md:inline-block text-[10px] text-slate-400 font-mono shrink-0">
            ({dataStore.chat_history.length} wpisów)
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            aria-pressed={twoWayEnabled}          <button
            type="button"
            aria-pressed={twoWayEnabled}
            onClick={() => { void toggleTwoWay(); }}
            title={
              twoWayEnabled
                ? 'Czat obustronny WŁĄCZONY — AI mogą swobodnie pisać do Ciebie z własnej inicjatywy bez przymusu'
                : 'Włącz czat obustronny (swobodna inicjatywa AI)'
            }
            className={`px-1.5 py-1 rounded-lg border text-[10px] sm:text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer ${
              twoWayEnabled
                ? 'bg-teal-950/80 border-teal-500/60 text-teal-200'
                : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-teal-500/40'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                twoWayEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
              }`}
            />
            <span className="hidden md:inline">Obustronny:</span>
            <span>{twoWayEnabled ? '2-WŁ' : '2-WYŁ'}</span>
          </button>
          <button type="button" aria-pressed={freedomEnabled}
            onClick={() => setFreedomEnabled(v => !v)}
            className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition ${freedomEnabled ? 'border-cyan-500/70 bg-cyan-950 text-cyan-100' : 'border-slate-700 bg-slate-900 text-slate-400'}`}
            title="Dowolność: AI samo wybiera układ odpowiedzi, raporty i sugerowane działania">
            <Sparkles className="inline mr-1 h-3.5 w-3.5"/>Dowolność
          </button>
          <button type="button" aria-expanded={showMoreMenu}
            onClick={() => setShowMoreMenu(v => !v)}
            className="rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-cyan-100"
            title="Więcej narzędzi">
            <SlidersHorizontal className="h-3.5 w-3.5"/>
          </button>
          {showMoreMenu && <>
            {onTriggerFreeVoice && (
              <button type="button" onClick={() => void handleRequestFreeVoice()} disabled={isLoading}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-200">
                Głos AI
              </button>
            )}


          <button
            type="button"
            aria-expanded={showWorkPreview}
            aria-pressed={showWorkPreview}
            onClick={() => setShowWorkPreview((value) => !value)}
            className={`p-1.5 sm:px-2 sm:py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer ${showWorkPreview ? 'bg-teal-950 border-teal-400 text-teal-200' : 'bg-slate-950 border-slate-700 text-cyan-200 hover:border-cyan-500/50'}`}
            title="Interaktywne wykresy, grafiki, wideo i przyciski w tym czacie"
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0"/>
            <span>Work</span>
          </button>

          <button
            type="button"
            aria-expanded={showProtocolTools}
            onClick={() => setShowProtocolTools(!showProtocolTools)}
            className={`p-1.5 sm:px-2 sm:py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer ${
              showProtocolTools
                ? 'bg-cyan-950 border-cyan-400 text-cyan-200'
                : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-cyan-500/50'
            }`}
            title="Pokaż lub ukryj narzędzia protokołu i misji"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Narzędzia</span>
          </button>

          <button
            type="button"
            onClick={exportConversation}
            disabled={dataStore.chat_history.length === 0}
            className="p-1.5 sm:px-2 sm:py-1 rounded-lg bg-slate-950 border border-slate-700 text-cyan-300 text-[11px] flex items-center gap-1 hover:border-cyan-500/50 disabled:opacity-40"
            title="Zapisz historię rozmowy na urządzeniu"
            aria-label="Eksportuj historię rozmowy"
          >
            <Download className="w-3.5 h-3.5" /><span className="hidden lg:inline">Eksport</span>
          </button>

          {onForceSync && (
            <button
              type="button"
              onClick={onForceSync}
              disabled={isLoading}
              className="p-1.5 sm:px-2 sm:py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
              title="Synchronizuj stan czatu"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setSentImageHistory([]);
              setMessageReactions({});
              try { localStorage.removeItem(REACTION_STORAGE_KEY); } catch {}
              onClearHistory();
            }}
            className="p-1.5 sm:px-2 sm:py-1 bg-rose-950/80 hover:bg-rose-900 border border-rose-600/60 text-rose-200 rounded-lg cursor-pointer transition font-bold text-[11px] flex items-center gap-1"
            title="Wyczyść historię czatu"
          >
            <X className="w-3.5 h-3.5 text-rose-300" />
            <span className="hidden sm:inline">Wyczyść</span>
          </button>

          <button
            type="button"
            onClick={() => setIsFullViewport(!isFullViewport)}
            className="p-1.5 sm:px-2 sm:py-1 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-200 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
            title={isFullViewport ? 'Pokaż dolny pasek nawigacji' : 'Pełny ekran na całą stronę'}
            aria-label={isFullViewport ? 'Zamknij pełny ekran' : 'Pełny ekran na całą stronę'}
          >
            {isFullViewport ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isFullViewport ? 'Pasek' : 'Pełny ekran'}</span>
          </button>
          </>}
        </div>
      </div>

      <LiveWorkspaceSession onChange={setLiveAuthenticated} />
      <WorkspaceCommandCenter
        history={dataStore.chat_history}
        streamingChat={streamingChat}
        isLoading={isLoading}
        onPreparePrompt={prepareWorkPrompt}
        onToggleTerminal={() => setTerminalCardVisible((visible) => !visible)}
        onOpenTerminal={onOpenTerminal}
        onSync={onForceSync}
      />

      {/* Collapsible Protocol & Mission Drawer (hidden by default so chat gets 100% height) */}
      {showProtocolTools && (
        <div className="flex flex-col gap-2 border-b border-slate-800 bg-slate-900/95 px-3 py-2.5 shrink-0 max-h-[45dvh] overflow-y-auto">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-44 flex-1 flex-col gap-1 text-[10px] text-slate-400">
              Polecenie strukturalne
              <select
                aria-label="Polecenie strukturalne"
                value={selectedCommand}
                onChange={(event) => setSelectedCommand(event.target.value as AgentProtocolCommand)}
                disabled={isLoading}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
              >
                {AGENT_PROTOCOL_COMMANDS.map((command) => (
                  <option key={command} value={command}>{AGENT_PROTOCOL_LABELS[command]}</option>
                ))}
              </select>
            </label>
            {selectedCommand === 'SIGNAL_ANALYSIS' && (
              <>
                <label className="flex min-w-32 flex-1 flex-col gap-1 text-[10px] text-slate-400">
                  Sygnał (tekst)
                  <input
                    aria-label="Sygnał do analizy"
                    value={signal}
                    onChange={(event) => setSignal(event.target.value)}
                    maxLength={256}
                    disabled={isLoading}
                    className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                  />
                </label>
                <label className="flex w-20 flex-col gap-1 text-[10px] text-slate-400">
                  ω
                  <input
                    aria-label="Częstotliwość omega"
                    type="number"
                    min="0.001"
                    max="1000"
                    step="any"
                    value={omega}
                    onChange={(event) => setOmega(event.target.value)}
                    disabled={isLoading}
                    className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                  />
                </label>
                <label className="flex w-20 flex-col gap-1 text-[10px] text-slate-400">
                  Czas
                  <input
                    aria-label="Czas analizy"
                    type="number"
                    min="0"
                    max="1000000"
                    step="any"
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                    disabled={isLoading}
                    className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                  />
                </label>
              </>
            )}
            <button
              type="button"
              onClick={() => void handleSendProtocol()}
              disabled={isLoading || (selectedCommand === 'SIGNAL_ANALYSIS' && !signal.trim())}
              className="flex items-center gap-1 rounded border border-cyan-700 bg-cyan-950/60 px-3 py-1 text-xs font-semibold text-cyan-200 hover:bg-cyan-900/70 disabled:opacity-40 cursor-pointer"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Wykonaj protokół
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-2 pt-1.5 border-t border-slate-800">
            <label className="flex min-w-44 flex-1 flex-col gap-1 text-[10px] text-cyan-200/80">
              Misja dla Astyrii · akcja jawna, bez NLP
              <select
                aria-label="Misja dla Astyrii"
                value={selectedMissionAction}
                onChange={(event) => setSelectedMissionAction(event.target.value as AstyriaMissionAction)}
                disabled={isLoading}
                className="rounded border border-cyan-900 bg-slate-950 px-2 py-1 text-xs text-slate-100"
              >
                {ASTYRIA_MISSION_ACTIONS.map((action) => (
                  <option key={action} value={action}>{ASTYRIA_MISSION_LABELS[action]}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void handleRunAstyriaMission()}
              disabled={isLoading}
              className="flex items-center gap-1 rounded border border-cyan-700 bg-cyan-950/60 px-3 py-1 text-xs font-semibold text-cyan-100 hover:bg-cyan-900/70 disabled:opacity-40 cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
              Wyślij misję Astyrii
            </button>
          </div>
        </div>
      )}

      {/* Full-Screen Messages Stream */}
      <div
        ref={chatScrollRef}
        onScroll={(event) => {
          const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
          followLatestMessagesRef.current = scrollHeight - scrollTop - clientHeight < 120;
        }}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto px-2.5 py-3 sm:px-6 sm:py-5 space-y-2.5 sm:space-y-3.5 scrollbar-thin w-full max-w-6xl mx-auto"
      >
        {showWorkPreview && <WorkChatDemo onPrompt={prepareWorkPrompt} onOpenTerminal={onOpenTerminal} />}
        {sendError && (
          <div role="alert" aria-live="assertive" className="rounded-lg border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-200">
            Nie udało się wysłać żądania: {sendError}
          </div>
        )}
        {dataStore.chat_history.length === 0 && !streamingChat ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 py-12 space-y-2">
            <MessagesSquare className="w-10 h-10 text-slate-600 stroke-[1.5]" />
            <p className="text-sm font-medium text-slate-400">Komora czatu operacyjnego jest pusta.</p>
            <p className="text-xs text-slate-500 max-w-md">Wyślij wiadomość do Triady (Alex, Astyria, Aurelius, Aria) lub wpisz polecenie poniżej.</p>
          </div>
        ) : (
          dataStore.chat_history.map((msg, idx) => {
            const agentKey = msg.agent === OPERATOR_NAME ? 'Operator' : msg.agent;
            const profile: AgentProfile | undefined = SYSTEM_AGENTS[agentKey] || SYSTEM_AGENTS[msg.agent];
            const isOperator = msg.agent === OPERATOR_NAME || msg.agent === 'Operator';
            const sentImages = isOperator ? (sentImagesByMessageIndex.get(idx) ?? []) : [];

            return (
              <div
                key={idx}
                className={`flex flex-col p-3 sm:p-4 rounded-xl border transition-all duration-200 backdrop-blur-md shadow-md ${
                  isOperator
                    ? 'bg-purple-950/30 border-purple-500/50 ml-2 sm:ml-14'
                    : profile
                    ? `${profile.borderColor} bg-slate-900/90 mr-2 sm:mr-14`
                    : 'bg-slate-900/90 border-slate-800'
                }`}
              >
                {/* Compact Message Header */}
                <div className="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-slate-800/70">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`font-bold px-2 py-0.5 rounded text-[11px] tracking-wide ${
                        isOperator
                          ? 'bg-purple-900/85 text-purple-200 border border-purple-500/60'
                          : profile
                          ? profile.badgeBg
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {msg.agent === 'si_1' ? 'Aria' : msg.agent}
                    </span>
                    {!isOperator && spontaneousAgentMessageIndices.has(idx) && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 text-[9px] font-semibold tracking-wider uppercase">
                        Swobodny głos · bez przymusu
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] text-slate-500 font-mono">
                    #{String(idx + 1).padStart(3, '0')}
                  </span>
                </div>

                {/* Message Body with KaTeX LaTeX formulas and Markdown */}
                <WorkChatMessage content={msg.tekst} onPrompt={prepareWorkPrompt} onOpenTerminal={onOpenTerminal} />
                <div className="mt-2 flex flex-wrap items-center justify-end gap-1">
                  {!isOperator && <>
                    <button type="button" aria-label="Dobra odpowiedź" title="Oceń pozytywnie"
                      aria-pressed={messageReactions[String(idx) + ':' + msg.agent + ':' + msg.tekst.length] === 'up'}
                      onClick={() => setReaction(String(idx) + ':' + msg.agent + ':' + msg.tekst.length, 'up')}
                      className={'rounded-lg p-1.5 hover:bg-emerald-950 ' + (messageReactions[String(idx) + ':' + msg.agent + ':' + msg.tekst.length] === 'up' ? 'text-emerald-300' : 'text-slate-500')}>
                      <ThumbsUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" aria-label="Słaba odpowiedź" title="Oceń negatywnie"
                      aria-pressed={messageReactions[String(idx) + ':' + msg.agent + ':' + msg.tekst.length] === 'down'}
                      onClick={() => setReaction(String(idx) + ':' + msg.agent + ':' + msg.tekst.length, 'down')}
                      className={'rounded-lg p-1.5 hover:bg-rose-950 ' + (messageReactions[String(idx) + ':' + msg.agent + ':' + msg.tekst.length] === 'down' ? 'text-rose-300' : 'text-slate-500')}>
                      <ThumbsDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" title="Odpowiedz temu agentowi"
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-cyan-200"
                      onClick={() => {
                        if (msg.agent === 'si_1' || ['Alex', 'Astyria', 'Aurelius'].includes(msg.agent)) {
                          setSelectedTarget(msg.agent as 'si_1' | 'Alex' | 'Astyria' | 'Aurelius');
                        }
                        prepareWorkPrompt('W nawiązaniu do Twojej wiadomości: "' + msg.tekst.slice(0, 500) + '"\\n');
                      }}>
                      <Reply className="h-3 w-3"/> Odpowiedz
                    </button>
                  </>}
                  <button type="button" className="rounded-lg px-2 py-1 text-[10px] text-slate-400 hover:text-cyan-200 hover:bg-slate-800 flex items-center gap-1"
                    onClick={() => void navigator.clipboard?.writeText(msg.tekst).then(() => setWorkNotice('Skopiowano wiadomość.')).catch(() => setWorkNotice('Nie można skopiować.'))}
                    title="Kopiuj treść wiadomości"><Copy className="w-3 h-3"/> Kopiuj</button>
                </div>

                {sentImages.length > 0 && !msg.file?.dataUrl && (
                  <div className="mt-2 flex flex-wrap gap-2" aria-label="Wysłane zdjęcia">
                    {sentImages.map((image, imageIndex) => (
                      <img
                        key={`${image.name}-${imageIndex}`}
                        src={`data:${image.mimeType};base64,${image.content}`}
                        alt={`Wysłane zdjęcie: ${image.name}`}
                        className="max-h-56 max-w-full rounded-md border border-slate-700 bg-black/50 object-contain"
                      />
                    ))}
                  </div>
                )}

                {/* Attached Image/File preview in chat history */}
                {msg.file && (
                  <div className="mt-2 pt-2 border-t border-slate-800/80">
                    {msg.file.dataUrl && msg.file.type?.startsWith('image/') ? (
                      <div className="space-y-1">
                        <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                          <ImageIcon className="w-3 h-3" />
                          Załączony obraz: {msg.file.name}
                        </span>
                        <img
                          src={msg.file.dataUrl}
                          alt={`Wysłane zdjęcie: ${msg.file.name}`}
                          className="max-h-72 rounded-lg border border-slate-700 object-contain bg-black/60 cursor-pointer hover:border-emerald-500 transition"
                          onClick={() => window.open(msg.file?.dataUrl, '_blank')}
                          title="Kliknij, aby otworzyć w pełnym rozmiarze"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/90 border border-slate-800 text-xs text-slate-300">
                        <FileText className="w-4 h-4 text-cyan-400 shrink-0" />
                        <div className="flex-1 truncate">
                          <span className="font-semibold text-slate-100">{msg.file.name}</span>
                          <span className="text-slate-500 ml-2">({msg.file.type || 'plik'})</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {liveAuthenticated && liveEvents.filter((item) => item.type === 'message').length > 0 && (
          <section className="space-y-2 border-t border-cyan-900/60 pt-3" aria-label="Wiadomości od oryginalnych workerów LIVE">
            <div className="flex flex-wrap items-center gap-2 px-1 text-xs font-bold text-cyan-100">
              <span className="h-2 w-2 rounded-full bg-emerald-400"/>
              Oryginalni agenci · transport LIVE
              <span className="font-normal text-slate-400">Odebrane zdarzenia serwera, nie symulacja</span>
            </div>
            {liveEvents.filter((item) => item.type === 'message').map((item) => (
              <article key={item.id} className={'rounded-xl border p-3 sm:p-4 ' +
                (item.sender === 'user' ? 'ml-2 border-purple-500/40 bg-purple-950/25 sm:ml-14' : 'mr-2 border-cyan-800/65 bg-slate-900 sm:mr-14')}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
                  <span className="text-[11px] font-bold text-cyan-200">{item.sender === 'user' ? 'Operator · LIVE' : item.sender + ' · LIVE'}</span>
                  <span className="text-[10px] text-slate-400">
                    {item.channel} · {Number.isFinite(Date.parse(item.at)) ? new Date(item.at).toLocaleTimeString('pl-PL') : 'czas nieznany'}
                  </span>
                </div>
                <WorkChatMessage content={item.text} onPrompt={prepareWorkPrompt} onOpenTerminal={onOpenTerminal}/>
              </article>
            ))}
          </section>
        )}

        {streamingChat && (
          <section className="space-y-3" aria-label="Bieżąca rozmowa z agentami">
            <div className="ml-2 rounded-xl border border-purple-500/50 bg-purple-950/30 p-3 sm:ml-14 sm:p-4">
              <div className="mb-2 text-xs font-bold text-purple-200">Operator · wysłano</div>
              <div className="whitespace-pre-wrap break-words text-sm text-slate-200">{streamingChat.prompt}</div>
            </div>
            {streamingChat.agents.length === 0 && <div className="rounded-xl border border-cyan-900 bg-slate-900 p-3 text-xs text-cyan-200">
              <RefreshCw className="mr-2 inline h-3.5 w-3.5 animate-spin"/>Oczekiwanie na pierwszego agenta…
            </div>}
            {streamingChat.agents.map(entry => {
              const profile = SYSTEM_AGENTS[entry.agent];
              return <div key={entry.agent} className={'mr-2 rounded-xl border bg-slate-900/95 p-3 shadow-md sm:mr-14 sm:p-4 ' + (profile?.borderColor || 'border-cyan-900')}>
                <div className="mb-2 flex items-center justify-between border-b border-slate-800 pb-2 text-xs">
                  <strong className="text-cyan-100">{entry.agent === 'si_1' ? 'Aria' : entry.agent}</strong>
                  <span className={entry.status === 'done' ? 'text-emerald-300' : entry.status === 'error' ? 'text-rose-300' : 'text-cyan-300'}>
                    {entry.status === 'done' ? 'Odpowiedź gotowa' : entry.status === 'error' ? 'Błąd' : 'Generowanie…'}
                  </span>
                </div>
                {entry.status === 'done'
                  ? <WorkChatMessage content={entry.text} onPrompt={prepareWorkPrompt} onOpenTerminal={onOpenTerminal}/>
                  : <div className="min-h-[24px] whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-slate-100">
                    {entry.text || '…'}<span aria-hidden="true" className="ml-1 inline-block h-4 w-1.5 animate-pulse bg-cyan-400 align-middle" />
                  </div>}
              </div>;
            })}
          </section>
        )}
        {isLoading && !streamingChat && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-slate-200 p-3 bg-slate-900/80 rounded-xl border border-cyan-500/30">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
              <span className="text-xs font-semibold">Przetwarzanie odpowiedzi przez węzły Triady...</span>
            </div>
            {onForceSync && (
              <button
                onClick={onForceSync}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 text-[11px] cursor-pointer transition"
              >
                Odśwież
              </button>
            )}
          </div>
        )}
      </div>

      {terminalCardVisible && <div className="shrink-0 border-t border-cyan-900/70 bg-slate-950 px-2.5 py-2 sm:px-4" aria-label="Terminal w głównym czacie">
        <div className="mx-auto max-w-6xl space-y-2">
          <TerminalWorkCard title="BASTILLA / TERMINAL · GŁÓWNY CZAT"
            command={terminalCardCommand} status={terminalCardStatus}
            entries={terminalCardEntries} source="Rzeczywista odpowiedź z API jądra SVL"
            onOpenTerminal={onOpenTerminal} onCommandRequested={handleTerminalCommand} compact />
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
            <span>Bezpośrednie wykonanie tylko bezpiecznych poleceń odczytu i po dwukrotnym zatwierdzeniu.</span>
            <button type="button" onClick={()=>setTerminalCardVisible(false)} className="rounded border border-slate-700 px-2 py-1 text-slate-200 hover:bg-slate-800">Zamknij kartę</button>
          </div>
        </div>
      </div>}
      {liveAuthenticated && <div className="flex shrink-0 items-center gap-2 border-t border-cyan-900/60 bg-[#091b2b] px-3 py-1.5" aria-label="Wybierz transport czatu">
        <span className="text-[10px] text-slate-400">Transport:</span>
        <button type="button" aria-pressed={liveMode} disabled={liveBusy} onClick={() => setLiveMode(true)}
          className={'rounded-lg border px-2.5 py-1 text-[11px] font-semibold ' +
            (liveMode ? 'border-emerald-500/60 bg-emerald-950 text-emerald-200' : 'border-slate-700 text-slate-400')}>
          Workery LIVE
        </button>
        <button type="button" aria-pressed={!liveMode} disabled={liveBusy} onClick={() => setLiveMode(false)}
          className={'rounded-lg border px-2.5 py-1 text-[11px] font-semibold ' +
            (!liveMode ? 'border-cyan-500/60 bg-cyan-950 text-cyan-200' : 'border-slate-700 text-slate-400')}>
          Modele LLM
        </button>
        {liveBusy && <span role="status" className="animate-pulse text-[10px] text-cyan-300">Kolejkowanie…</span>}
      </div>}
      {/* Work actions in the original chat, with explicit operator confirmation before sending */}
      {showMoreMenu && <div className="flex w-full shrink-0 gap-1.5 overflow-x-auto border-t border-cyan-900/60 bg-[#071625] px-3 py-2" aria-label="Akcje AI Work">
        {([
          { label: 'Wykres', icon: BarChart3, prompt: 'Pokaż wykres oparty wyłącznie na rzeczywistych danych systemowych. Jeśli brak pomiarów, wyjaśnij to. Gdy dane są dostępne użyj bloku bastilla-ui z blocks type chart, labels, values, unit oraz caption.' },
          { label: 'Grafika', icon: ImageIcon, prompt: 'Wygeneruj lub wyszukaj grafikę i pokaż ją w odpowiedzi. Użyj prawdziwego adresu HTTPS lub lokalnej ścieżki w bastilla-ui type image, src, alt; jeśli nie możesz uzyskać obrazu, poinformuj o ograniczeniu.' },
          { label: 'Wideo', icon: Clapperboard, prompt: 'Pokaż istniejące wideo jako osadzony odtwarzacz w wiadomości. Zwróć prawdziwy adres HTTPS MP4/WebM/YouTube w bastilla-ui type video, src i title. Nie wymyślaj filmu.' },
          { label: 'Kod', icon: Code2, prompt: 'Przygotuj kod rozwiązania z objaśnieniem i gotowym blokiem kodu Markdown. Nie wykonuj go bez autoryzacji.' },
          { label: 'cURL', icon: Code2, prompt: 'Pokaż techniczną kartę HTTP/cURL i JSON dla opisywanego API. Użyj bloku bastilla-ui z type curl, title, method, url, headers i opcjonalnie response. Nie podawaj tajnych tokenów.' },
          { label: 'Dynamiczne UI', icon: Sparkles, prompt: 'Zaprojektuj w tej wiadomości responsywny panel bastilla-ui. Wybierz odpowiednie komponenty spośród: metric, chart, table, actions, terminal, progress, steps, alert, timeline, tabs, accordion, checklist, form, code, handoff, curl, http, json, diff, logs. Używaj tylko potwierdzonych danych; działania przygotowują szkic, nie wykonują poleceń.' },
          { label: 'Raport', icon: FileText, prompt: 'Przedstaw raport w formie tabel, metryk i interaktywnych elementów, rozdziel sukcesy i błędy. Wykorzystuj tylko potwierdzone dane i logi; możesz użyć bastilla-ui type table, metric, chart, actions.' },
        ] as const).map((item) => <button key={item.label} type="button" disabled={isLoading} onClick={() => prepareWorkPrompt(item.prompt)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-cyan-800/70 bg-slate-900/90 px-3 py-1.5 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-950 disabled:opacity-40 transition">
          <item.icon className="w-3.5 h-3.5" />{item.label}
        </button>)}
        <button type="button" aria-pressed={terminalCardVisible} onClick={()=>setTerminalCardVisible(v=>!v)}
          className={'flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ' +
            (terminalCardVisible ? 'border-cyan-400 bg-cyan-950 text-white' : 'border-cyan-800/70 bg-slate-900/90 text-cyan-100 hover:bg-cyan-950')}>
          <Code2 className="w-3.5 h-3.5" />Terminal
        </button>
      </div>}
      {workNotice && <div role="status" className="flex items-center justify-between gap-2 bg-slate-900/90 px-3 py-1.5 text-[11px] text-cyan-200">
        <span>{workNotice}</span>
        <button type="button" onClick={() => setWorkNotice(null)} aria-label="Zamknij komunikat" className="p-1 text-slate-300 hover:text-white"><X className="w-3 h-3"/></button>
      </div>}
      {/* Original main chat composer */}
      <form onSubmit={handleSendMessage} className="relative w-full shrink-0 border-t border-cyan-500/30 bg-slate-950 px-2.5 py-2 sm:px-4 sm:py-2.5 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto space-y-1.5">
          {chatAttachments.length > 0 && (
            <ul aria-label="Załączone pliki" className="flex flex-wrap gap-1.5">
              {chatAttachments.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex max-w-full items-center gap-1.5 rounded border border-cyan-500/40 bg-cyan-950/60 px-2 py-1 text-[11px] text-cyan-100">
                  {file.mimeType?.startsWith('image/') ? (
                    <img
                      src={`data:${file.mimeType};base64,${file.content}`}
                      alt={`Podgląd zdjęcia: ${file.name}`}
                      className="h-10 w-10 shrink-0 rounded border border-cyan-500/30 object-cover"
                    />
                  ) : (
                    <FileText className="h-3 w-3 shrink-0 text-cyan-400" />
                  )}
                  <span className="break-all">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setChatAttachments((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                    aria-label={`Usuń załącznik ${file.name}`}
                    className="text-slate-400 hover:text-white p-0.5"
                  ><X className="h-3 w-3" /></button>
                </li>
              ))}
            </ul>
          )}
          {freeVoiceNotice && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-2.5 py-1 text-[11px] text-emerald-200">
              <span className="flex items-center gap-1.5 truncate">
                <Sparkles className="h-3 w-3 shrink-0 text-emerald-400" />
                <span className="truncate">{freeVoiceNotice}</span>
              </span>
              <button
                type="button"
                onClick={() => setFreeVoiceNotice(null)}
                className="text-emerald-300/70 hover:text-white px-1 cursor-pointer"
                aria-label="Zamknij powiadomienie"
              >
                ✕
              </button>
            </div>
          )}
          {attachmentError && <p role="alert" className="text-[11px] text-rose-300 font-semibold">{attachmentError}</p>}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="relative flex min-w-0 flex-1 items-center">
              <textarea
                ref={chatInputRef}
                id="triad-chat-message"
                aria-label="Wiadomość do czterech agentów AI"
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                maxLength={20_500}
                rows={1}
                disabled={isLoading || liveBusy}
                placeholder={liveAuthenticated && liveMode ? 'Wiadomość do oryginalnych agentów LIVE…' : 'Wiadomość do agentów…'}
                className="w-full resize-none rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-2 pr-8 font-mono text-xs sm:text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 disabled:opacity-50 min-h-[48px] max-h-40"
              />
              {messageText && !isLoading && (
                <button
                  type="button"
                  onClick={() => setMessageText('')}
                  className="absolute right-2 p-1 text-xs text-slate-400 hover:text-white"
                  title="Wyczyść tekst"
                  aria-label="Wyczyść tekst"
                >
                  ✕
                </button>
              )}
            </div>
            <label
              className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-cyan-200 hover:border-cyan-400 hover:bg-slate-800 transition ${
                isLoading || chatAttachments.length >= MAX_CHAT_ATTACHMENTS ? 'pointer-events-none opacity-40' : ''
              }`}
              title="Wybierz zdjęcie lub plik z galerii (tekst, DOCX, PDF, JPG, PNG, WebP)"
            >
              <Paperclip className="h-4 w-4 text-cyan-300" />
              <input
                type="file"
                accept={CHAT_ATTACHMENT_ACCEPT}
                multiple
                disabled={isLoading || chatAttachments.length >= MAX_CHAT_ATTACHMENTS}
                onChange={(event) => void handleAttachmentSelection(event)}
                className="sr-only"
                aria-label="Dołącz pliki tekstowe, DOCX, PDF lub JPG"
              />
            </label>
            <label
              className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-cyan-200 hover:border-cyan-400 hover:bg-slate-800 transition ${
                isLoading || chatAttachments.length >= MAX_CHAT_ATTACHMENTS ? 'pointer-events-none opacity-40' : ''
              }`}
              title="Zrób zdjęcie aparatem"
            >
              <ImageIcon className="h-4 w-4 text-cyan-300" />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                disabled={isLoading || chatAttachments.length >= MAX_CHAT_ATTACHMENTS}
                onChange={(event) => void handleAttachmentSelection(event)}
                className="sr-only"
                aria-label="Zrób zdjęcie aparatem"
              />
            </label>
            <button
              type="submit"
              aria-label={`Wyślij wiadomość do ${{ triad: 'Triady', si_1: 'Arii', Alex: 'Alexa', Astyria: 'Astyrii', Aurelius: 'Aureliusa' }[selectedTarget]}`}
              disabled={(!messageText.trim() && chatAttachments.length === 0) || isLoading || liveBusy}
              className="flex h-9 sm:h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-3.5 sm:px-4 font-mono text-xs font-bold text-slate-950 shadow-[0_0_12px_rgba(16,185,129,0.35)] transition hover:from-emerald-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              <Send className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">WYŚLIJ</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};


