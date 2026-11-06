import React, { useEffect, useRef, useState } from 'react';
import { DataStore, OPERATOR_NAME } from '../kernel/svlKernel';
import { SYSTEM_AGENTS, AgentProfile } from '../kernel/agents';
import { Sparkles, ShieldCheck, RefreshCw, Image as ImageIcon, FileText, MessagesSquare, Paperclip, Send, X, SlidersHorizontal, Maximize2, Minimize2, BarChart3, Clapperboard, Code2, Copy, Download, Reply, ThumbsDown, ThumbsUp } from 'lucide-react';
import { WorkChatMessage, WorkChatDemo } from './WorkChatMessage';
import { ChatEngineSelector } from './ChatEngineSelector';
import { ChatAttachmentMenu } from './ChatAttachmentMenu';
import { TerminalWorkCard, type TerminalCardEntry, type TerminalCardStatus } from './TerminalWorkCard';
import { WorkspaceCommandCenter } from './WorkspaceCommandCenter';
import { ChatAvatar, ChatReactionBar, type ChatVotes } from './ChatReactionBar';
import { chatReactionKeys } from '../lib/chatReactionKeys.mjs';
import { loadPendingReactionVotes, mergePendingReactionVotes, nextOperatorReaction } from '../lib/chatReactionFallback.mjs';
import { draftAgentTarget } from '../lib/workChatRouting.mjs';
import { summarizeFreeVoiceEngines } from '../lib/freeVoiceEngine.mjs';
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
    providerMode?: 'api' | 'ollama',
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
    engines?: Record<string, string>;
  }>;
  onTriggerInitiative?: () => Promise<void>;
  onUnclog?: () => void;
  onRestoreBackup?: () => void;
}

const TWO_WAY_STORAGE_KEY = 'bastilla_two_way_chat_enabled';
const FREEDOM_STORAGE_KEY = 'bastilla_ai_freedom_enabled';
const PROVIDER_MODE_STORAGE_KEY = 'bastilla_chat_provider_mode_v1';
const REACTION_STORAGE_KEY = 'bastilla_chat_message_reactions_v1';
type ReactionSelection = 'up' | 'down' | null;

async function saveReactionOnServer(messageKey: string, vote: ReactionSelection): Promise<ChatVotes> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch('/api/chat/reactions/vote', {
      method: 'POST', credentials: 'same-origin', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageKey, vote, mode: 'set' }),
    });
    const payload = await response.json().catch(() => null) as { success?: boolean; votes?: ChatVotes; error?: string } | null;
    if (!response.ok || !payload?.success || !payload.votes) {
      throw new Error(payload?.error || 'Serwer ocen niedostępny (HTTP ' + response.status + ').');
    }
    return payload.votes;
  } finally { window.clearTimeout(timeout); }
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
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickResult, setQuickResult] = useState<{ title: string; lines: string[]; at: string; failed?: boolean; reply?: string } | null>(null);
  const handledDraftRef = useRef<number | null>(null);
  const [providerMode, setProviderMode] = useState<'api' | 'ollama'>(() => {
    try { return localStorage.getItem(PROVIDER_MODE_STORAGE_KEY) === 'ollama' ? 'ollama' : 'api'; }
    catch { return 'api'; }
  });

  useEffect(() => {
    try { localStorage.setItem(PROVIDER_MODE_STORAGE_KEY, providerMode); } catch {}
  }, [providerMode]);
  const pendingReactionVotesRef = useRef<Record<string, ReactionSelection>>(
    loadPendingReactionVotes(typeof localStorage !== 'undefined' ? localStorage : null, REACTION_STORAGE_KEY)
  );
  const [reactionVotes, setReactionVotes] = useState<Record<string, ChatVotes>>(() =>
    mergePendingReactionVotes({}, pendingReactionVotesRef.current)
  );
  const [reactionPending, setReactionPending] = useState<string | null>(null);
  const [reactionsLocalOnly, setReactionsLocalOnly] = useState(false);
  const reactionSyncInFlightRef = useRef(false);
  const persistPendingReactions = () => {
    try { localStorage.setItem(REACTION_STORAGE_KEY, JSON.stringify(pendingReactionVotesRef.current)); } catch {}
  };
  const reactionKeys = React.useMemo(() => chatReactionKeys(dataStore.chat_history), [dataStore.chat_history]);
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

  // Shared votes come from the server. Unsynced operator votes stay visible
  // and survive page reloads, including inside AI Studio Preview.
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 4500);
        let payload: { reactions?: Record<string, ChatVotes> };
        try {
          const response = await fetch('/api/chat/reactions', {
            credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
          });
          if (!response.ok) return;
          payload = await response.json();
        } finally { window.clearTimeout(timeout); }
        if (!active || !payload?.reactions || typeof payload.reactions !== 'object') return;
        const remote = payload.reactions;
        setReactionVotes(mergePendingReactionVotes(remote, pendingReactionVotesRef.current));
        if (reactionSyncInFlightRef.current) return;
        if (!Object.keys(pendingReactionVotesRef.current).length) {
          setReactionsLocalOnly(false);
          return;
        }
        reactionSyncInFlightRef.current = true;
        try {
          for (const [key, desired] of Object.entries(pendingReactionVotesRef.current)) {
            if (!active) break;
            try {
              const votes = await saveReactionOnServer(key, desired);
              remote[key] = votes;
              // Preserve any newer selection made while this request was in flight.
              if (pendingReactionVotesRef.current[key] === desired) {
                delete pendingReactionVotesRef.current[key];
                persistPendingReactions();
              }
            } catch { break; }
          }
        } finally {
          reactionSyncInFlightRef.current = false;
          if (active) {
            setReactionVotes(mergePendingReactionVotes(remote, pendingReactionVotesRef.current));
            setReactionsLocalOnly(Object.keys(pendingReactionVotesRef.current).length > 0);
          }
        }
      } catch { /* The local copy remains usable when API is offline. */ }
    };
    const onSync = (event: Event) => {
      const topic = (event as CustomEvent<{ topic?: string }>).detail?.topic;
      if (topic === 'chat' || topic === 'workspace') void refresh();
    };
    const onVisible = () => { if (!document.hidden) void refresh(); };
    void refresh();
    const poll = window.setInterval(() => { if (!document.hidden) void refresh(); }, 7000);
    window.addEventListener('bastilla:workspace-event', onSync);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearInterval(poll);
      window.removeEventListener('bastilla:workspace-event', onSync);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [dataStore.chat_history.length]);

  const submitReaction = async (messageKey: string, value: 'up' | 'down') => {
    if (!messageKey || reactionPending) return;
    const selected = nextOperatorReaction(reactionVotes[messageKey]?.Operator, value) as ReactionSelection;
    pendingReactionVotesRef.current[messageKey] = selected;
    persistPendingReactions();
    setReactionVotes(current => mergePendingReactionVotes(current, pendingReactionVotesRef.current));
    setReactionPending(messageKey);
    try {
      const votes = await saveReactionOnServer(messageKey, selected);
      if (pendingReactionVotesRef.current[messageKey] === selected) {
        delete pendingReactionVotesRef.current[messageKey];
        persistPendingReactions();
      }
      setReactionVotes(current => mergePendingReactionVotes(
        { ...current, [messageKey]: votes }, pendingReactionVotesRef.current
      ));
      setReactionsLocalOnly(Object.keys(pendingReactionVotesRef.current).length > 0);
      window.dispatchEvent(new CustomEvent('bastilla:workspace-local', { detail: { topic: 'chat' } }));
    } catch (error) {
      setReactionsLocalOnly(true);
      setWorkNotice('👍👎 Ocena zachowana lokalnie. Serwer nie potwierdził zapisu: ' +
        (error instanceof Error ? error.message : 'Błąd połączenia.') +
        ' Ponowimy synchronizację automatycznie.');
    } finally { setReactionPending(null); }
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
    // Diagnosis cards can explicitly name an agent. Select the actual chat channel
    // as well; merely prefixing a message would still send it to the wrong agent.
    const chosen = draftAgentTarget(prompt);
    if (chosen) setSelectedTarget(chosen as 'si_1' | 'Alex' | 'Astyria' | 'Aurelius');
    setMessageText(prompt);
    setWorkNotice('Polecenie przygotowane. Możesz je edytować i wysłać do wybranego agenta.');
    window.requestAnimationFrame(() => chatInputRef.current?.focus());
  };

  // A click on an AI-supplied action is not a chat composer event.
  // Known read-only diagnostics call existing authenticated API routes.
  // Other actions ask the selected AI directly, never execute untrusted shell commands.
  const runQuickAction = async (rawPrompt: string, target = selectedTarget) => {
    const prompt = rawPrompt.trim().slice(0, 8000);
    if (!prompt || quickBusy) return;
    const normalized = prompt.toLocaleLowerCase('pl');
    const readOnly =
      /(?:sprawdź|pokaż|wyświetl|odczytaj|przejrzyj).{0,65}logi|logi systemowe|rzeczywiste logi|potwierdzone logi/.test(normalized) ? 'logs'
      : /(?:sprawdź|pokaż|wyświetl|odczytaj).{0,55}(?:proces|obciążenie cpu|użycie pamięci|zużycie pamięci)/.test(normalized) ? 'processes'
      : /(?:sprawdź|pokaż|odczytaj).{0,55}(?:stan ollamy|status ollamy|status ollama)/.test(normalized) ? 'ollama'
      : /(?:sprawdź|pokaż|odczytaj).{0,55}(?:status workerów|stan workerów)/.test(normalized) ? 'workers'
      : /(?:sprawdź|pokaż|odczytaj).{0,55}(?:narzędzia diagnostyczne|dostępność narzędzi)/.test(normalized) ? 'tools' : null;
    const endpoints: Record<string, string> = {
      logs: '/api/operations/logs?filter=all',
      processes: '/api/operations/processes',
      ollama: '/api/operations/ollama',
      workers: '/api/live-chat/status',
      tools: '/api/operations/diagnostics/tools',
    };
    const titles: Record<string, string> = {
      logs: 'Logi systemowe', processes: 'Procesy i obciążenie',
      ollama: 'Ollama · stan serwera', workers: 'Workery AI', tools: 'Narzędzia diagnostyczne',
    };
    setQuickBusy(true);
    setQuickResult(null);
    setWorkNotice(null);
    try {
      if (!readOnly) {
        // The isolated endpoint returns an AI answer to this panel only;
        // it does NOT append an operator message or execute a system command.
        const response = await fetch('/api/work-actions/ask', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, agent: target, providerMode }),
        });
        const data = await response.json() as { success?: boolean; error?: string; agent?: string; reply?: string };
        if (!response.ok || !data.success) throw new Error(data.error || 'Brak odpowiedzi agenta AI.');
        setQuickResult({
          title: 'Akcja AI · ' + (data.agent === 'si_1' ? 'Aria' : data.agent || target),
          at: new Date().toLocaleTimeString('pl-PL'),
          lines: ['Wynik analizy w panelu; niczego nie wysłano do czatu ani nie zmieniono w systemie.'],
          reply: data.reply || 'Agent nie zwrócił treści.',
        });
        return;
      }
      const response = await fetch(endpoints[readOnly], { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 503
        ? 'Diagnostyka wymaga aktywnej sesji operatora.'
        : 'Odczyt diagnostyki nie powiódł się (HTTP ' + response.status + ').');
      const data = await response.json() as Record<string, any>;
      const lines: string[] = [];
      if (readOnly === 'logs') {
        lines.push('Błędy: ' + (data.counts?.errors ?? '—') + ' · Sukcesy: ' + (data.counts?.success ?? '—') + ' · Info: ' + (data.counts?.info ?? '—'));
        for (const item of (Array.isArray(data.logs) ? data.logs : []).slice(0, 20)) {
          lines.push('[' + String(item.level ?? item.category ?? 'info').slice(0, 12) + '] '
            + String(item.source ?? 'system').slice(0, 50) + ': ' + String(item.message ?? '').slice(0, 240));
        }
      } else if (readOnly === 'processes') {
        lines.push('Stan pomiaru: ' + (data.available ? 'dostępny' : 'niedostępny'));
        for (const proc of (Array.isArray(data.processes) ? data.processes : []).slice(0, 15)) {
          lines.push(String(proc.name ?? 'proces').slice(0, 80) + ' · PID ' + (proc.pid ?? '—')
            + ' · CPU ' + (typeof proc.cpuPercent === 'number' ? proc.cpuPercent.toFixed(1) : '—') + '%');
        }
      } else if (readOnly === 'ollama') {
        lines.push('Serwer: ' + (data.connected ? 'ONLINE' : 'OFFLINE'));
        lines.push('Model: ' + String(data.configuredModel ?? 'nieznany').slice(0, 100));
        lines.push('Model w RAM: ' + (data.modelLoaded === true ? 'TAK' : data.modelLoaded === false ? 'NIE' : 'nieznany'));
        if (data.error) lines.push('Błąd: ' + String(data.error).slice(0, 240));
      } else if (readOnly === 'workers') {
        for (const [name, details] of Object.entries(data.agents || {}).slice(0, 8)) {
          const status = details as { status?: string; queued?: number; running?: number };
          lines.push(name + ': ' + (status.status ?? 'nieznany') + ' · kolejka ' + (status.queued ?? '?') + ' · wykonuje ' + (status.running ?? '?'));
        }
      } else {
        lines.push('W katalogu: ' + (data.total ?? '—') + ' · wykryte w PATH: ' + (data.pathDetected ?? '—'));
        for (const tool of (Array.isArray(data.tools) ? data.tools : []).slice(0, 10)) {
          lines.push(String(tool.name ?? 'narzędzie').slice(0, 100) + ': ' + (tool.available === true ? 'wykryte' : 'niepotwierdzone'));
        }
      }
      setQuickResult({ title: titles[readOnly], lines: lines.length ? lines : ['Serwer nie zwrócił danych do wyświetlenia.'], at: new Date().toLocaleTimeString('pl-PL') });
    } catch (error) {
      setQuickResult({
        title: readOnly ? titles[readOnly] : 'Akcja AI',
        lines: [error instanceof Error ? error.message : 'Nie udało się wykonać akcji.'],
        at: new Date().toLocaleTimeString('pl-PL'), failed: true,
      });
    } finally {
      setQuickBusy(false);
    }
  };

  useEffect(() => {
    if (!preparedDraft || handledDraftRef.current === preparedDraft.id || isLoading) return;
    handledDraftRef.current = preparedDraft.id;
    setSelectedTarget(preparedDraft.agent);
    void runQuickAction(preparedDraft.text, preparedDraft.agent);
  }, [preparedDraft?.id, isLoading]);

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
      const engines = summarizeFreeVoiceEngines(res.engines, res.spokenAgents);
      if (res.skipped || res.spokenAgents.length === 0) {
        const attempted = summarizeFreeVoiceEngines(res.engines, Object.keys(res.engines || {}));
        setFreeVoiceNotice('Brak wypowiedzi. ' + (attempted || 'Model lub źródło niepotwierdzone.'));
      } else {
        const names = res.spokenAgents.map((a) => (a === 'si_1' ? 'Aria' : a)).join(', ');
        setFreeVoiceNotice(`Swobodny głos: ${names}. Źródło: ${engines || 'niepotwierdzone'}.`);
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
    if ((!message && chatAttachments.length === 0) || isLoading) return;
    const attachmentsSnapshot = [...chatAttachments];
    try {
      await onSendMessage(message, selectedTarget, attachmentsSnapshot, freedomEnabled, providerMode);
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
      } bastilla-chat-shell flex min-h-0 min-w-0 flex-col overflow-hidden bg-slate-950 font-mono text-xs cyber-grid`}
    >
      {/* Ultra-compact Single-Line Top Bar */}
      <div className="bastilla-chat-toolbar bg-slate-900/95 backdrop-blur-md border-b border-cyan-500/30 px-2 sm:px-4 py-1.5 flex items-center justify-between gap-1.5 shadow-sm shrink-0">
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
              setReactionVotes({});
              pendingReactionVotesRef.current = {};
              setReactionsLocalOnly(false);
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

      {showMoreMenu && <WorkspaceCommandCenter
        history={dataStore.chat_history}
        streamingChat={streamingChat}
        isLoading={isLoading}
        onPreparePrompt={prompt => { void runQuickAction(prompt); }}
        onToggleTerminal={() => setTerminalCardVisible((visible) => !visible)}
        onOpenTerminal={onOpenTerminal}
        onSync={onForceSync}
      />}
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
        className="bastilla-chat-scroller min-h-0 min-w-0 flex-1 overflow-y-auto px-2.5 py-3 sm:px-6 sm:py-5 space-y-2.5 sm:space-y-3.5 scrollbar-thin w-full max-w-6xl mx-auto"
      >
        {showWorkPreview && <WorkChatDemo onPrompt={prompt => { void runQuickAction(prompt); }} onPreparePrompt={prepareWorkPrompt} onOpenTerminal={onOpenTerminal} />}
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
            const destination = !isOperator && typeof msg.tekst === 'string'
              ? msg.tekst.match(/^\[Do: ([^\]\n]+)\]\n/)?.[1] : undefined;


            return (
              <div
                key={idx}
                className={`bastilla-chat-card ${isOperator ? "bastilla-chat-card--user" : ""} flex flex-col p-3 sm:p-4 rounded-xl border transition-all duration-200 backdrop-blur-md shadow-md ${
                  isOperator
                    ? 'bg-purple-950/30 border-purple-500/50 ml-2 sm:ml-14'
                    : profile
                    ? `${profile.borderColor} bg-slate-900/90 mr-2 sm:mr-14`
                    : 'bg-slate-900/90 border-slate-800'
                }`}
              >
                {/* Compact Message Header */}
                <div className="bastilla-chat-card__header flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-slate-800/70">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ChatAvatar actor={msg.agent} />
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
                    {destination && <span className="rounded border border-cyan-800/60 bg-[#0b2537] px-1.5 py-0.5 text-[10px] font-medium text-cyan-200">
                      → {destination}
                    </span>}
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
                <WorkChatMessage content={destination ? msg.tekst.replace(/^\[Do: [^\]\n]+\]\n/, '') : msg.tekst}
                  onPrompt={prompt => { void runQuickAction(prompt); }} onPreparePrompt={prepareWorkPrompt} onOpenTerminal={onOpenTerminal} />
                <div className="bastilla-chat-card__actions mt-2 flex flex-wrap items-center justify-end gap-1">
                  <ChatReactionBar
                    votes={reactionVotes[reactionKeys[idx]] || {}}
                    disabled={reactionPending === reactionKeys[idx]}
                    onVote={vote => void submitReaction(reactionKeys[idx], vote)}
                  />
                  {!isOperator && <>
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

        {streamingChat && (
          <section className="space-y-3" aria-label="Bieżąca rozmowa z agentami">
            <div className="bastilla-chat-card bastilla-chat-card--user ml-2 rounded-xl border border-purple-500/50 bg-purple-950/30 p-3 sm:ml-14 sm:p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-purple-200"><ChatAvatar actor="Operator" size="sm" /> Operator · wysłano</div>
              <div className="whitespace-pre-wrap break-words text-sm text-slate-200">{streamingChat.prompt}</div>
            </div>
            {streamingChat.agents.length === 0 && <div className="rounded-xl border border-cyan-900 bg-slate-900 p-3 text-xs text-cyan-200">
              <RefreshCw className="mr-2 inline h-3.5 w-3.5 animate-spin"/>Oczekiwanie na pierwszego agenta…
            </div>}
            {streamingChat.agents.map(entry => {
              const profile = SYSTEM_AGENTS[entry.agent];
              return <div key={entry.agent} className={'bastilla-chat-card bastilla-chat-card--stream mr-2 rounded-xl border bg-slate-900/95 p-3 shadow-md sm:mr-14 sm:p-4 ' + (profile?.borderColor || 'border-cyan-900')}>
                <div className="mb-2 flex items-center justify-between border-b border-slate-800 pb-2 text-xs">
                  <div className="flex items-center gap-2"><ChatAvatar actor={entry.agent} size="sm" /><strong className="text-cyan-100">{entry.agent === 'si_1' ? 'Aria' : entry.agent}</strong></div>
                  <span className={entry.status === 'done' ? 'text-emerald-300' : entry.status === 'error' ? 'text-rose-300' : 'text-cyan-300'}>
                    {entry.status === 'done' ? 'Odpowiedź gotowa' : entry.status === 'error' ? 'Błąd' : 'Generowanie…'}
                  </span>
                </div>
                {entry.status === 'done'
                  ? <WorkChatMessage content={entry.text} onPrompt={prompt => { void runQuickAction(prompt); }} onPreparePrompt={prepareWorkPrompt} onOpenTerminal={onOpenTerminal}/>
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
      {/* Single-click Work actions: read-only diagnostics or isolated AI analysis in the results panel. */}
      {showMoreMenu && <div className="bastilla-chat-actions flex w-full shrink-0 gap-1.5 overflow-x-auto border-t border-cyan-900/60 bg-[#071625] px-3 py-2" aria-label="Akcje AI Work">
        {([
          { label: 'Wykres', icon: BarChart3, prompt: 'Pokaż wykres oparty wyłącznie na rzeczywistych danych systemowych. Jeśli brak pomiarów, wyjaśnij to. Gdy dane są dostępne użyj bloku bastilla-ui z blocks type chart, labels, values, unit oraz caption.' },
          { label: 'Grafika', icon: ImageIcon, prompt: 'Wygeneruj lub wyszukaj grafikę i pokaż ją w odpowiedzi. Użyj prawdziwego adresu HTTPS lub lokalnej ścieżki w bastilla-ui type image, src, alt; jeśli nie możesz uzyskać obrazu, poinformuj o ograniczeniu.' },
          { label: 'Wideo', icon: Clapperboard, prompt: 'Pokaż istniejące wideo jako osadzony odtwarzacz w wiadomości. Zwróć prawdziwy adres HTTPS MP4/WebM/YouTube w bastilla-ui type video, src i title. Nie wymyślaj filmu.' },
          { label: 'Kod', icon: Code2, prompt: 'Przygotuj kod rozwiązania z objaśnieniem i gotowym blokiem kodu Markdown. Nie wykonuj go bez autoryzacji.' },
          { label: 'cURL', icon: Code2, prompt: 'Pokaż techniczną kartę HTTP/cURL i JSON dla opisywanego API. Użyj bloku bastilla-ui z type curl, title, method, url, headers i opcjonalnie response. Nie podawaj tajnych tokenów.' },
          { label: 'Dynamiczne UI', icon: Sparkles, prompt: 'Zaprojektuj w tej wiadomości responsywny panel bastilla-ui. Wybierz odpowiednie komponenty spośród: metric, chart, table, actions, terminal, progress, steps, alert, timeline, tabs, accordion, checklist, form, code, handoff, curl, http, json, diff, logs. Używaj tylko potwierdzonych danych; przyciski odczytują bezpośrednio, a zmiany systemowe wymagają zgody.' },
          { label: 'Raport', icon: FileText, prompt: 'Przedstaw raport w formie tabel, metryk i interaktywnych elementów, rozdziel sukcesy i błędy. Wykorzystuj tylko potwierdzone dane i logi; możesz użyć bastilla-ui type table, metric, chart, actions.' },
        ] as const).map((item) => <button key={item.label} type="button" disabled={isLoading} onClick={() => void runQuickAction(item.prompt)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-cyan-800/70 bg-slate-900/90 px-3 py-1.5 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-950 disabled:opacity-40 transition">
          <item.icon className="w-3.5 h-3.5" />{item.label}
        </button>)}
        <button type="button" aria-pressed={terminalCardVisible} onClick={()=>setTerminalCardVisible(v=>!v)}
          className={'flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ' +
            (terminalCardVisible ? 'border-cyan-400 bg-cyan-950 text-white' : 'border-cyan-800/70 bg-slate-900/90 text-cyan-100 hover:bg-cyan-950')}>
          <Code2 className="w-3.5 h-3.5" />Terminal
        </button>
      </div>}
      {(quickBusy || quickResult) && <section role="region" aria-label="Wynik akcji" className="mx-3 my-2 max-h-[32dvh] overflow-y-auto rounded-xl border border-cyan-700/70 bg-[#071c2b] p-3 text-xs text-slate-200">
        <div className="flex items-center justify-between gap-2">
          <strong className="text-cyan-200">{quickBusy ? 'Wykonuję akcję…' : quickResult?.title}</strong>
          <button type="button" onClick={() => setQuickResult(null)} disabled={quickBusy} className="rounded p-1 hover:bg-slate-800" aria-label="Zamknij wynik"><X className="h-4 w-4"/></button>
        </div>
        {quickResult && <>
          <p className="mt-1 text-[10px] text-slate-400">Odczyt z API · {quickResult.at}</p>
          <div role={quickResult.failed ? 'alert' : 'status'} className={'mt-2 space-y-1 whitespace-pre-wrap break-words ' + (quickResult.failed ? 'text-rose-300' : 'text-slate-200')}>
            {quickResult.lines.map((line, index) => <p key={index}>{line}</p>)}
            {quickResult.reply && <div className="mt-2 border-t border-slate-700 pt-2 text-sm">
              <WorkChatMessage content={quickResult.reply} onPrompt={next => { void runQuickAction(next); }} onOpenTerminal={onOpenTerminal}/>
            </div>}
          </div>
        </>}
      </section>}
      {reactionsLocalOnly && <div role="status" className="px-3 py-1.5 text-[11px] text-amber-300 bg-amber-950/30 border-t border-amber-800/30">👍👎 Oceny zapisane na tym urządzeniu · oczekiwanie na synchronizację z serwerem.</div>}
      {workNotice && <div role="status" className="flex items-center justify-between gap-2 bg-slate-900/90 px-3 py-1.5 text-[11px] text-cyan-200">
        <span>{workNotice}</span>
        <button type="button" onClick={() => setWorkNotice(null)} aria-label="Zamknij komunikat" className="p-1 text-slate-300 hover:text-white"><X className="w-3 h-3"/></button>
      </div>}
      {/* Main chat composer — mobile-first, two-row layout */}
      <form onSubmit={handleSendMessage} className="bastilla-chat-composer w-full shrink-0 border-t border-slate-800 bg-slate-950/95 px-3 py-2.5 sm:px-5 sm:py-3">
        <div className="mx-auto max-w-4xl">
          {chatAttachments.length > 0 && (
            <ul aria-label="Załączone pliki" className="mb-2 flex flex-wrap gap-1.5">
              {chatAttachments.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex max-w-full items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200">
                  {file.mimeType?.startsWith('image/') ? (
                    <img src={`data:${file.mimeType};base64,${file.content}`} alt={`Podgląd: ${file.name}`} className="h-9 w-9 shrink-0 rounded-lg object-cover"/>
                  ) : <FileText className="h-4 w-4 shrink-0 text-slate-400"/>}
                  <span className="max-w-[60vw] truncate">{file.name}</span>
                  <button type="button" onClick={() => setChatAttachments(current => current.filter((_, fileIndex) => fileIndex !== index))}
                    aria-label={`Usuń załącznik ${file.name}`} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4"/></button>
                </li>
              ))}
            </ul>
          )}
          {freeVoiceNotice && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200">
              <span className="flex min-w-0 items-center gap-2"><Sparkles className="h-4 w-4 shrink-0"/><span className="truncate">{freeVoiceNotice}</span></span>
              <button type="button" onClick={() => setFreeVoiceNotice(null)} aria-label="Zamknij komunikat" className="p-1 text-emerald-300 hover:text-white"><X className="h-4 w-4"/></button>
            </div>
          )}
          {(attachmentError || sendError) && <p role="alert" className="mb-2 text-xs text-rose-300">{attachmentError || sendError}</p>}
          <div className="bastilla-chat-composer-panel rounded-[24px] border border-slate-700 bg-[#202123] shadow-[0_4px_18px_rgba(0,0,0,.24)] transition focus-within:border-slate-500">
            <textarea
              ref={chatInputRef}
              id="triad-chat-message"
              aria-label="Wiadomość do agentów"
              value={messageText}
              onChange={event => setMessageText(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              maxLength={20_500}
              rows={2}
              disabled={isLoading}
              placeholder="Wiadomość do agentów…"
              className="block max-h-40 min-h-[62px] w-full resize-y bg-transparent px-4 pt-4 pb-2 text-[16px] leading-6 text-white outline-none placeholder:text-slate-400 disabled:opacity-50 sm:px-5"
            />
            <div className="flex min-h-12 items-center gap-2 px-2.5 pb-2 sm:px-3">
              <ChatAttachmentMenu disabled={isLoading || chatAttachments.length >= MAX_CHAT_ATTACHMENTS}
                onFiles={(kind) => {
                  const picker = document.getElementById('chat-attachment-picker') as HTMLInputElement | null;
                  if (!picker) return;
                  const types: Record<string,string> = {
                    image: 'image/png,image/jpeg,image/webp', document: '.pdf,.docx,.txt',
                    video: 'video/mp4,video/webm', audio: 'audio/mpeg,audio/wav',
                    code: '.js,.ts,.tsx,.jsx,.py,.json,.md', logs: '.log,.txt,.json'
                  };
                  picker.accept = types[kind] ?? CHAT_ATTACHMENT_ACCEPT;
                  picker.click();
                }}
                onSource={(source) => {
                  const prompts: Record<string,string> = {
                    github: 'Przeanalizuj plik, commit lub PR z GitHub. Poproś o link.',
                    explorer: 'Chcę wybrać plik z eksploratora Bastilli.',
                    terminal: 'Przeanalizuj ostatni wynik terminala bez uruchamiania poleceń.',
                    diagnostics: 'Przygotuj rzeczywisty raport diagnostyczny CPU, RAM i usług.',
                    mcp: 'Pokaż dostępne narzędzia MCP i ich wyniki.',
                    screenshot: 'Chcę dołączyć zrzut ekranu.',
                    error: 'Przygotuj raport błędu z rzeczywistych logów.',
                    history: 'Chcę przekazać wybrane wiadomości historii czatu innemu agentowi.'
                  };
                  setMessageText(current => current ? current + '\n' + prompts[source] : prompts[source]);
                  chatInputRef.current?.focus();
                }}/>
              <input id="chat-attachment-picker" type="file" accept={CHAT_ATTACHMENT_ACCEPT} multiple
                disabled={isLoading || chatAttachments.length >= MAX_CHAT_ATTACHMENTS}
                onChange={event => void handleAttachmentSelection(event)} className="sr-only"
                aria-label="Dołącz pliki tekstowe, DOCX, PDF lub zdjęcia"/>
              <div className="min-w-0 flex-1"/>
              <ChatEngineSelector value={providerMode} onChange={setProviderMode} disabled={isLoading}/>
              <button type="submit"
                aria-label={isLoading ? 'Wysyłanie wiadomości' : `Wyślij wiadomość do ${{ triad: 'wszystkich agentów', si_1: 'Arii', Alex: 'Alexa', Astyria: 'Astyrii', Aurelius: 'Aureliusa' }[selectedTarget]}`}
                disabled={(!messageText.trim() && chatAttachments.length === 0) || isLoading}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-950 transition hover:bg-slate-200 disabled:bg-slate-600 disabled:text-slate-400"
                title="Wyślij (Enter)">
                {isLoading ? <RefreshCw className="h-5 w-5 animate-spin"/> : <Send className="h-5 w-5"/>}
              </button>
            </div>
          </div>
          <p className="mt-1.5 px-2 text-[10px] text-slate-500">Enter wysyła · Shift+Enter dodaje nową linię · Do: {{ triad: 'wszyscy agenci', si_1: 'Aria', Alex: 'Alex', Astyria: 'Astyria', Aurelius: 'Aurelius' }[selectedTarget]}</p>
        </div>
      </form>
    </div>
  );
};


