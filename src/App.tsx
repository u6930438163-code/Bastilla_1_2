import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  DataStore,
  INITIAL_DATA_STORE,
  SYS_VERSION,
  normalizeDataStore,
} from './kernel/svlKernel';
import { Header } from './components/Header';
import { LiveProgressBar } from './components/LiveProgressBar';
import { SystemResourceMeters } from './components/SystemResourceMeters';
import { OllamaModelManager } from './components/OllamaModelManager';
import { BackgroundAgentsStatus } from './components/BackgroundAgentsStatus';
import { Navigation, TabId, initialTabFromLocation } from './components/Navigation';
import { TerminalView } from './components/TerminalView';
import { AgentCommsView } from './components/AgentCommsView';
import { ChatApprovalsView } from './components/ChatApprovalsView';
import { MonolithView } from './components/MonolithView';
import { DataStoreView } from './components/DataStoreView';
import { ChronolithView } from './components/ChronolithView';
import { DiagnosticsView } from './components/DiagnosticsView';
import { ReportModal } from './components/ReportModal';
import { TaskManagerView } from './components/TaskManagerView';
import { MemorySchemaGraph } from './components/MemorySchemaGraph';
import { TemporalMatrix } from './components/TemporalMatrix';
import { AstyriaMissionView } from './components/AstyriaMissionView';
import { TriadVisualization } from './components/TriadVisualization';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SystemHealthDock } from './components/SystemHealthDock';
import { FileExplorer } from './components/FileExplorer';
import { AppsStudioView } from './components/AppsStudioView';
import { WithoutNlpView } from './components/WithoutNlpView';
import { GitHubExportView } from './components/GitHubExportView';
import { CloudLibraryView } from './components/CloudLibraryView';
import { IntegrationsView } from './components/IntegrationsView';
import { LibreChatView } from './components/LibreChatView';
import { BastillaDashboard } from './components/BastillaDashboard';
import { BastillaOS2View } from './components/BastillaOS2View';
import {
  AstyriaMissionAction,
  AgentProtocolReply,
  AgentProtocolRequest,
  isAgentProtocolCommand,
  isTriadAgent,
  parseChatProtocolCommand,
  TRIAD_AGENT_NAMES,
} from './kernel/agentProtocol';
import { ChatAttachment, formatChatMessage } from './kernel/chatAttachments';
import { isChatSystemChange } from './kernel/chatChanges';
import type { ChatSystemChange } from './kernel/chatChanges';

const LOCAL_STORAGE_KEY = 'svl_kernel_datastore_v9_0_0_chat_sync';

export default function App() {
  const [preparedChatDraft, setPreparedChatDraft] = useState<{ id: number; text: string; agent: 'triad' | 'Alex' | 'Astyria' | 'Aurelius' | 'si_1' } | null>(null);
  const [rawDataStore, setRawDataStore] = useState<DataStore>(() => {
    try {
      localStorage.removeItem('svl_kernel_datastore_v8_5_1_desktop_ready');
      localStorage.removeItem('svl_kernel_datastore_v8_6_0_without_nlp');
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return normalizeDataStore(parsed);
      }
    } catch (e) {
      console.warn('Failed to parse cached DATA_STORE from localStorage:', e);
    }
    return INITIAL_DATA_STORE;
  });

  // Avoid rebuilding the entire store on every UI render (typing, tabs, loading states).
  const dataStore = useMemo(() => normalizeDataStore(rawDataStore), [rawDataStore]);

  const setDataStore: React.Dispatch<React.SetStateAction<DataStore>> = useCallback((updater) => {
    setRawDataStore((prev) => {
      const safePrev = normalizeDataStore(prev);
      const next = typeof updater === 'function' ? (updater as (p: DataStore) => DataStore)(safePrev) : updater;
      return normalizeDataStore(next);
    });
  }, []);

  const [activeTab, setActiveTab] = useState<TabId>(initialTabFromLocation);
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const [terminalBusy, setTerminalBusy] = useState(false);
  const [workspaceLive, setWorkspaceLive] = useState(false);
  const terminalPendingRef = useRef(0);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [chatSystemChange, setChatSystemChange] = useState<ChatSystemChange | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  // Expose navigation to window for internal component linking
  useEffect(() => {
    (window as any).setActiveTab = setActiveTab;
  }, []);

  // Ref mirrors isAgentLoading so in-flight polls never overwrite a freshly returned chat state
  const isAgentLoadingRef = useRef(isAgentLoading);
  useEffect(() => {
    isAgentLoadingRef.current = isAgentLoading;
  }, [isAgentLoading]);

  // One cross-device SSE stream, plus browser-tab notifications and a 4s fallback.
  // The server sends change metadata only; /api/kernel/state is authoritative.
  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let queuedFresh = false;
    let controller: AbortController | null = null;
    let stream: EventSource | null = null;
    let connecting = false;
    let lastEventId = '';
    const tabChannel = typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel('bastilla-workspace-v1') : null;

    const fetchState = async (forceFresh = false) => {
      if (disposed || document.hidden || isAgentLoadingRef.current) return;
      if (inFlight) { if (forceFresh) queuedFresh = true; return; }
      inFlight = true;
      controller = new AbortController();
      try {
        const url = forceFresh ? '/api/kernel/state?fresh=1' : '/api/kernel/state';
        const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        if (!res.ok || disposed || isAgentLoadingRef.current) return;
        const data = await res.json();
        if (!disposed && data?.store && !isAgentLoadingRef.current) {
          const incomingStore = normalizeDataStore(data.store);
          setDataStore((prev) =>
            JSON.stringify(prev) === JSON.stringify(incomingStore) ? prev : incomingStore
          );
        }
      } catch (err) {
        if (!(err instanceof Error && err.name === 'AbortError')) {
          console.warn('Kernel state refresh failed:', err);
        }
      } finally {
        inFlight = false;
        controller = null;
        if (queuedFresh) { queuedFresh = false; void fetchState(true); }
      }
    };

    const emitWorkspaceEvent = (raw: unknown, forward: boolean) => {
      const item = raw as { id?: unknown; topic?: unknown; at?: unknown };
      if (!item || !['terminal', 'kernel', 'chat', 'agents', 'workspace'].includes(String(item.topic))) return;
      const event = {
        id: String(item.id || ''),
        topic: String(item.topic),
        at: typeof item.at === 'string' ? item.at : new Date().toISOString(),
      };
      window.dispatchEvent(new CustomEvent('bastilla:workspace-event', { detail: event }));
      if (forward) tabChannel?.postMessage(event);
      void fetchState(true);
    };

    const connect = async () => {
      if (disposed || stream || connecting) return;
      connecting = true;
      try {
        const session = await fetch('/api/live-chat/session', {
          credentials: 'same-origin', cache: 'no-store',
        });
        if (!session.ok || disposed) return; // Not logged in: keep 4s polling.
        const suffix = lastEventId ? '?after=' + encodeURIComponent(lastEventId) : '';
        stream = new EventSource('/api/workspace/events' + suffix, { withCredentials: true });
        stream.onopen = () => {
          if (!disposed) { setWorkspaceLive(true); void fetchState(true); }
        };
        stream.onerror = () => {
          if (disposed) return;
          setWorkspaceLive(false);
          stream?.close();
          stream = null; // Periodic check reconnects without a busy 401 loop.
        };
        stream.addEventListener('change', (message) => {
          try {
            const event = JSON.parse((message as MessageEvent).data);
            if (event.id) lastEventId = String(event.id);
            emitWorkspaceEvent(event, true);
          } catch { /* malformed notification cannot replace authoritative state */ }
        });
      } catch {
        if (!disposed) setWorkspaceLive(false);
      } finally {
        connecting = false;
      }
    };

    const refreshLocal = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      emitWorkspaceEvent({ topic: detail?.topic || 'workspace', at: new Date().toISOString() }, true);
    };
    const resetSession = () => {
      stream?.close(); stream = null;
      setWorkspaceLive(false);
      void connect();
    };
    if (tabChannel) tabChannel.onmessage = (event) => emitWorkspaceEvent(event.data, false);
    window.addEventListener('bastilla:workspace-local', refreshLocal);
    window.addEventListener('bastilla:live-chat-auth', resetSession);
    void fetchState(true);
    void connect();
    const interval = window.setInterval(() => { void fetchState(); }, 4000);
    const reconnect = window.setInterval(() => { if (!stream) void connect(); }, 20000);
    const onVisible = () => {
      if (!document.hidden) { void fetchState(true); if (!stream) void connect(); }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      controller?.abort();
      stream?.close();
      tabChannel?.close();
      window.clearInterval(interval);
      window.clearInterval(reconnect);
      window.removeEventListener('bastilla:workspace-local', refreshLocal);
      window.removeEventListener('bastilla:live-chat-auth', resetSession);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [setDataStore]);

  // Sync with LocalStorage whenever dataStore changes
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataStore));
    } catch (e) {
      console.error('LocalStorage write failed:', e);
    }
  }, [dataStore]);

  // Execute terminal command directly on Python SVL Kernel
  const handleExecutePythonCommand = async (command: string) => {
    terminalPendingRef.current += 1;
    setTerminalBusy(true);
    try {
    const res = await fetch('/api/kernel/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
    if (!res.ok) {
      throw new Error(`Błąd polecenia jądra: ${res.statusText}`);
    }
    const data = await res.json();
    if (data.state?.store) {
      setDataStore(normalizeDataStore(data.state.store));
    }
    window.dispatchEvent(new CustomEvent('bastilla:workspace-local', { detail: { topic: 'terminal' } }));
    return data;
    } finally {
      terminalPendingRef.current = Math.max(0, terminalPendingRef.current - 1);
      setTerminalBusy(terminalPendingRef.current > 0);
    }
  };

  // Full system & version synchronization via Astyria mission endpoint + kernel state
  const handleSyncSystem = async () => {
    try {
      const res = await fetch('/api/astyria/mission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_versions', silentChat: true }),
      });
      if (res.ok) {
        const data = await res.json();
        const rawStore = data.state?.store || data.state;
        if (rawStore) {
          const normalized = normalizeDataStore(rawStore);
          setDataStore(normalized);
          try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalized));
          } catch {}
          return;
        }
      }
      // Fallback direct state fetch if mission endpoint didn't return store (fresh=1 bypasses server cache)
      const stateRes = await fetch('/api/kernel/state?fresh=1');
      if (stateRes.ok) {
        const stateData = await stateRes.json();
        if (stateData?.store) {
          const normalized = normalizeDataStore(stateData.store);
          setDataStore(normalized);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Immediate manual force sync (used by AgentCommsView Synchronizuj button)
  const handleForceSync = async () => {
    try {
      await handleSyncSystem();
    } finally {
      setIsAgentLoading(false);
    }
  };

  const handleSendProtocol = async (request: AgentProtocolRequest): Promise<AgentProtocolReply | undefined> => {
    setIsAgentLoading(true);
    setAgentError(null);

    try {
      if (
        !request ||
        !isAgentProtocolCommand(request.command) ||
        (request.agent !== 'triad' && !isTriadAgent(request.agent))
      ) {
        throw new Error('Nieprawidłowe polecenie protokołu operatora.');
      }

      const response = await fetch('/api/triad/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        let message = `Serwer zwrócił błąd HTTP ${response.status}`;
        try {
          const errorData: unknown = await response.json();
          if (
            errorData &&
            typeof errorData === 'object' &&
            'error' in errorData &&
            typeof errorData.error === 'string'
          ) {
            message = errorData.error;
          }
        } catch {}
        throw new Error(message);
      }

      const result: unknown = await response.json();
      const resultRecord = result && typeof result === 'object' ? result as Record<string, unknown> : null;
      const stateRecord = resultRecord?.state && typeof resultRecord.state === 'object'
        ? resultRecord.state as Record<string, unknown>
        : null;
      const returnedStore = stateRecord?.store;
      if (
        !returnedStore ||
        typeof returnedStore !== 'object' ||
        Array.isArray(returnedStore) ||
        !('config' in returnedStore) ||
        !('chat_history' in returnedStore) ||
        !('update_history' in returnedStore) ||
        !returnedStore.config ||
        typeof returnedStore.config !== 'object' ||
        !Array.isArray(returnedStore.chat_history) ||
        !Array.isArray(returnedStore.update_history)
      ) {
        throw new Error('Serwer zwrócił nieprawidłowy stan DATA_STORE dla polecenia protokołu.');
      }

      let agentReply: AgentProtocolReply | undefined;
      if (request.agent !== 'triad') {
        const replyRecord = resultRecord?.reply;
        if (
          !replyRecord ||
          typeof replyRecord !== 'object' ||
          Array.isArray(replyRecord) ||
          !('agent' in replyRecord) ||
          replyRecord.agent !== request.agent ||
          !('command' in replyRecord) ||
          replyRecord.command !== request.command ||
          !('data' in replyRecord) ||
          !replyRecord.data ||
          typeof replyRecord.data !== 'object' ||
          Array.isArray(replyRecord.data)
        ) {
          throw new Error('Serwer nie zwrócił prawidłowej odpowiedzi wybranego agenta.');
        }
        agentReply = {
          agent: request.agent,
          command: request.command,
          data: replyRecord.data as Record<string, unknown>,
        };
      }

      const normalized = normalizeDataStore(returnedStore as DataStore);
      setDataStore(normalized);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalized));
      return agentReply;
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : 'Nie udało się wykonać polecenia protokołu.');
      throw err;
    } finally {
      setIsAgentLoading(false);
    }
  };

  const handleRunAstyriaMission = async (action: AstyriaMissionAction) => {
    setIsAgentLoading(true);
    setAgentError(null);
    try {
      const response = await fetch('/api/astyria/mission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true || typeof result.reply !== 'string') {
        throw new Error(result.error || `Nie udało się wykonać misji Astyrii (HTTP ${response.status}).`);
      }
      const store = result.state?.store;
      if (
        !store ||
        typeof store !== 'object' ||
        !Array.isArray(store.chat_history) ||
        !store.chat_history.some((message: unknown) =>
          message !== null &&
          typeof message === 'object' &&
          'agent' in message &&
          'tekst' in message &&
          (message as { agent?: unknown }).agent === 'Astyria' &&
          (message as { tekst?: unknown }).tekst === result.reply
        )
      ) {
        throw new Error('Misja zwróciła wynik, ale nie potwierdziła zapisu odpowiedzi Astyrii w historii czatu.');
      }
      const normalized = normalizeDataStore(store as DataStore);
      setDataStore(normalized);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalized));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udało się wykonać misji Astyrii.';
      setAgentError(message);
      throw error;
    } finally {
      setIsAgentLoading(false);
    }
  };

  const handleSendMessage = async (
    message: string,
    chatAgent: AgentProtocolRequest['agent'] = 'triad',
    attachments: ChatAttachment[] = [],
  ) => {
    const protocolCommand = attachments.length === 0
      ? parseChatProtocolCommand(message, chatAgent)
      : null;
    if (protocolCommand) {
      await handleSendProtocol(protocolCommand);
      return;
    }

    setIsAgentLoading(true);
    setAgentError(null);
    try {
      const normalizedCommand = message
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pl-PL')
        .replace(/\s+/g, ' ');
      const isFullChatRepair = attachments.length === 0 && [
        'napraw to',
        'napraw czat',
        'pelna naprawa czatu',
        'odpowiedz pelna naprawa czatu',
      ].includes(normalizedCommand);
      const response = await fetch(isFullChatRepair ? '/api/astyria/mission' : '/api/triad/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isFullChatRepair
          ? { action: 'full_system_app_chat_repair', userMessage: message.trim() }
          : { message, agent: chatAgent, attachments }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true || typeof result.reply !== 'string') {
        throw new Error(result.error || `Nie udało się wysłać wiadomości (HTTP ${response.status}).`);
      }
      const normalized = normalizeDataStore(result.state?.store);
      const expectedAgentReplies = isFullChatRepair
        ? [{ agent: 'Astyria', tekst: result.reply }]
        : chatAgent === 'triad'
        ? TRIAD_AGENT_NAMES.map((agent) => ({
            agent,
            tekst: result.replies?.[agent],
          }))
        : [{ agent: chatAgent, tekst: result.reply }];
      if (expectedAgentReplies.some((entry) => typeof entry.tekst !== 'string' || !entry.tekst.trim())) {
        throw new Error('Nie otrzymano odpowiedzi wszystkich wybranych agentów.');
      }
      const expectedTranscript = [
        {
          agent: 'Mateusz Mitek',
          tekst: attachments.length > 0
            ? formatChatMessage(message, attachments)
            : message.startsWith('/propose write-file ')
            ? message
            : message.trim(),
        },
        ...expectedAgentReplies,
      ];
      const history = normalized.chat_history;
      const persisted = history.some((entry, start) =>
        expectedTranscript.every((expected, index) =>
          history[start + index]?.agent === expected.agent &&
          history[start + index]?.tekst === expected.tekst
        )
      );
      if (!persisted) {
        throw new Error('Serwer nie potwierdził zapisu wiadomości i odpowiedzi.');
      }
      setDataStore(normalized);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalized));
      setChatSystemChange(isChatSystemChange(result.change) ? result.change : null);
      window.dispatchEvent(new CustomEvent('bastilla:workspace-local', { detail: { topic: 'chat' } }));
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Nie udało się wysłać wiadomości.';
      setAgentError(messageText);
      throw error;
    } finally {
      setIsAgentLoading(false);
    }
  };

  const handleTriggerFreeVoice = async (
    chatAgent: AgentProtocolRequest['agent'] = 'triad',
    topicHint?: string,
    allowSilenceAll = false,
  ): Promise<{
    skipped: boolean;
    spokenAgents: string[];
    spokenCount: number;
    silentAgents: string[];
    messages: Array<{ agent: string; tekst: string }>;
  }> => {
    setIsAgentLoading(true);
    setAgentError(null);
    try {
      const response = await fetch('/api/triad/free-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: chatAgent, topicHint, allowSilenceAll }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) {
        throw new Error(result.error || `Nie udało się wywołać swobodnego głosu AI (HTTP ${response.status}).`);
      }
      if (result.state?.store) {
        const normalized = normalizeDataStore(result.state.store);
        setDataStore(normalized);
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalized));
        } catch {}
      }

      const spokenAgents: string[] = Array.isArray(result.spokenAgents) ? result.spokenAgents : [];
      const messages: Array<{ agent: string; tekst: string }> =
        result.replies && typeof result.replies === 'object'
          ? Object.entries(result.replies as Record<string, unknown>)
              .filter(([, text]) => typeof text === 'string')
              .map(([agent, text]) => ({ agent, tekst: text as string }))
          : spokenAgents.map((agent) => ({ agent, tekst: '' }));

      const allCandidates = chatAgent === 'triad' ? ['Alex', 'Astyria', 'si_1', 'Aurelius'] : [chatAgent];
      const silentAgents = allCandidates.filter((agent) => !spokenAgents.includes(agent));

      return {
        skipped: Boolean(result.skipped) || spokenAgents.length === 0,
        spokenAgents,
        spokenCount: spokenAgents.length,
        silentAgents,
        messages,
      };
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Nie udało się otworzyć swobodnego głosu AI.';
      setAgentError(messageText);
      throw error;
    } finally {
      setIsAgentLoading(false);
    }
  };

  const handleProvisionGeminiVm = async (): Promise<{ status: string; sshCommand: string }> => {
    const response = await fetch('/api/vm-gemini-4/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'create',
        confirmation: 'CREATE_VM_GEMINI_4',
      }),
    });
    const result: unknown = await response.json();
    if (
      !response.ok ||
      !result ||
      typeof result !== 'object' ||
      !('success' in result) ||
      result.success !== true ||
      !('status' in result) ||
      typeof result.status !== 'string' ||
      !('sshCommand' in result) ||
      typeof result.sshCommand !== 'string'
    ) {
      const error = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
        ? result.error
        : `Nie udało się utworzyć VM (HTTP ${response.status}).`;
      throw new Error(error);
    }
    return { status: result.status, sshCommand: result.sshCommand };
  };

  const handleClearHistory = async () => {
    setDataStore((prev) => ({
      ...prev,
      chat_history: []
    }));

    try {
      await fetch('/api/kernel/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'clear_chat' })
      });
    } catch (e) {
      console.warn('Backend clear_chat failed:', e);
    }
  };

  const handleResetToDefault = () => {
    if (confirm(`Czy na pewno chcesz przywrócić stan bazowy jądra SVL v${SYS_VERSION}?`)) {
      setDataStore(INITIAL_DATA_STORE);
      try {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      } catch (e) {
        console.error(e);
      }
    }
  };

  return (
    <ErrorBoundary>
      <div className="app-shell flex h-dvh max-h-dvh min-w-0 max-w-full flex-col overflow-hidden bg-[#050b18] font-sans text-slate-100 selection:bg-cyan-400/30 selection:text-cyan-100">
        {activeTab !== 'comms' && (
          <Header
            dataStore={dataStore}
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            onReset={handleResetToDefault}
            onShowReport={() => setShowReportModal(true)}
            onSyncSystem={handleSyncSystem}
          />
        )}

        {activeTab !== 'terminal' && <div className="bastilla-workspace-sync-strip" role="status" aria-live="polite">
          <span className={workspaceLive ? 'bastilla-workspace-sync-dot is-live' : 'bastilla-workspace-sync-dot'} />
          <span className="font-semibold">{workspaceLive ? 'WORKSPACE LIVE' : 'WORKSPACE · ODSWIEZANIE 4s'}</span>
          <span className="bastilla-workspace-sync-detail">{workspaceLive ? 'Czat · terminal · jądro: zmiany na żywo' : 'Zaloguj się w Czat AI · LIVE, aby włączyć synchronizację SSE'}</span>
          <button type="button" onClick={() => setActiveTab('terminal')}>Otwórz terminal</button>
        </div>}

        {(isAgentLoading || terminalBusy) && activeTab !== 'comms' && (
          <div className="px-3 py-2 shrink-0">
            <LiveProgressBar active label={terminalBusy ? 'Terminal — wykonywanie polecenia' : 'AI — przetwarzanie zapytania'} detail="Trwa rzeczywiste żądanie do serwera; procent nie jest dostępny." />
          </div>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <Navigation
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            messageCount={dataStore?.chat_history?.length || 0}
            versionCount={dataStore?.update_history?.length || 0}
          />

        <main className="app-main flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
          {activeTab === 'home' && <SystemResourceMeters />}
          {activeTab === 'home' && <OllamaModelManager />}
          {activeTab === 'home' && <BackgroundAgentsStatus />}

          {activeTab === 'home' && (
            <BastillaDashboard
              dataStore={dataStore}
              onNavigate={setActiveTab}
              onSendMessage={handleSendMessage}
              onProvisionGeminiVm={handleProvisionGeminiVm}
            />
          )}

          {activeTab === 'bastilla_os_2' && (
            <BastillaOS2View
              dataStore={dataStore}
              onNavigate={setActiveTab}
              onSendMessage={handleSendMessage}
              onTriggerFreeVoice={handleTriggerFreeVoice}
              preparedDraft={preparedChatDraft}
              onExecutePythonCommand={handleExecutePythonCommand}
            />
          )}

          {activeTab === 'comms' && (
            <AgentCommsView
              dataStore={dataStore}
              onSendProtocol={handleSendProtocol}
              onSendMessage={handleSendMessage}
              onRunAstyriaMission={handleRunAstyriaMission}
              isLoading={isAgentLoading}
              sendError={agentError}
              onClearHistory={handleClearHistory}
              onForceSync={handleForceSync}
              onTriggerFreeVoice={handleTriggerFreeVoice}
            />
          )}

          {activeTab === 'approvals' && (
            <ChatApprovalsView
              onUpdateDataStore={setDataStore}
              onChatChange={setChatSystemChange}
            />
          )}

          {(activeTab === 'process_matrix' || activeTab === 'task_manager' || activeTab === 'ollama_manager') && (
            <TaskManagerView
              initialSection={activeTab === 'ollama_manager' ? 'ollama' : 'processes'}
              onPrepareMainChat={(text, agent) => {
                setPreparedChatDraft({ id: Date.now(), text, agent: agent === 'Aria' ? 'si_1' : agent });
                setActiveTab('comms');
              }}
            />
          )}

          {activeTab === 'astyria_mission' && (
            <AstyriaMissionView
              dataStore={dataStore}
              onUpdateDataStore={setDataStore}
            />
          )}

          {activeTab === 'schema_graph' && (
            <MemorySchemaGraph dataStore={dataStore} />
          )}

          {activeTab === 'temporal' && (
            <TemporalMatrix
              dataStore={dataStore}
              onRestoreSnapshot={(restored) => setDataStore(restored)}
              onAddUpdate={(ver, desc) => {
                handleExecutePythonCommand(`bump ${ver} ${desc}`);
              }}
            />
          )}

          {/* Keep the terminal mounted so local command history and live events survive navigation. */}
          <div className={activeTab === 'terminal' ? 'flex min-h-0 min-w-0 flex-1' : 'hidden'}>
            <TerminalView
              dataStore={dataStore}
              onUpdateDataStore={setDataStore}
              onSendProtocol={handleSendProtocol}
              onExecutePythonCommand={handleExecutePythonCommand}
              workspaceLive={workspaceLive}
            />
          </div>

          {activeTab === 'monolith' && (
            <MonolithView
              dataStore={dataStore}
              onSetDataStore={setDataStore}
            />
          )}

          {activeTab === 'datastore' && (
            <DataStoreView
              dataStore={dataStore}
              onUpdateDataStore={setDataStore}
            />
          )}

          {activeTab === 'diagnostics' && (
            <DiagnosticsView dataStore={dataStore} />
          )}

          {activeTab === 'visualizer' && (
            <TriadVisualization />
          )}

          {activeTab === 'file_explorer' && (
            <FileExplorer />
          )}

          {activeTab === 'apps' && (
            <AppsStudioView
              chatChange={chatSystemChange}
              onChatChangeApplied={() => setChatSystemChange(null)}
            />
          )}

          {activeTab === 'hyper_com' && (
            <section className="flex min-h-0 flex-1 flex-col bg-slate-950">
              <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-2">
                <h1 className="text-xs font-semibold text-cyan-200">HyperCom — konsola transmisji</h1>
                <a
                  href="/api/apps/preview/hyper_com_module/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-cyan-300 hover:text-cyan-100"
                >
                  Otwórz osobno
                </a>
              </header>
              <iframe
                src="/api/apps/preview/hyper_com_module/"
                title="HyperCom — konsola transmisji"
                className="min-h-0 w-full flex-1 border-0"
                sandbox="allow-scripts allow-forms allow-same-origin allow-modals"
              />
            </section>
          )}

          {activeTab === 'without_nlp' && (
            <WithoutNlpView onSendProtocol={handleSendProtocol} />
          )}

          {activeTab === 'integrations' && <IntegrationsView onOpenLibrary={() => setActiveTab('cloud_library')} onOpenLibreChat={() => setActiveTab('librechat')} />}
          {activeTab === 'librechat' && <LibreChatView />}

          {activeTab === 'cloud_library' && <CloudLibraryView />}
          {activeTab === 'project_progress' && (
            <section className="flex min-h-[75dvh] flex-1 flex-col bg-slate-950">
              <header className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
                <h1 className="text-sm font-semibold text-cyan-100">Bastilla OS 2 — postęp i aktualności</h1>
                <a href="/dashboard/bastilla-os-2-progress.html" target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-300">Pełny ekran</a>
              </header>
              <iframe src="/dashboard/bastilla-os-2-progress.html" title="Postęp Bastilla OS 2 z GitHuba" className="min-h-[70dvh] w-full flex-1 border-0" sandbox="allow-scripts allow-same-origin allow-popups" />
            </section>
          )}

          {activeTab === 'github' && (
            <GitHubExportView />
          )}
        </main>
        </div>

        <ReportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          dataStore={dataStore}
        />

        <SystemHealthDock />
      </div>
    </ErrorBoundary>
  );
}
