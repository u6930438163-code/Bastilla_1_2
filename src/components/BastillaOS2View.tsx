import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  ExternalLink,
  Layers,
  Terminal,
  FileCheck,
  Ban,
  Cpu,
  MessagesSquare,
  Send,
  Sparkles,
  Plug,
  Activity,
} from 'lucide-react';
import { DataStore } from '../kernel/svlKernel';
import { TabId } from './Navigation';
import { AgentProtocolRequest } from '../kernel/agentProtocol';
import { ChatAttachment } from '../kernel/chatAttachments';
import { OllamaModelManager } from './OllamaModelManager';

interface AgentTaskArtifact {
  path: string;
  name: string;
  sizeBytes: number;
}

interface AgentTask {
  id: string;
  agent: 'Alex' | 'Astyria' | 'Aurelius' | 'Aria' | 'Operator';
  title: string;
  description: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  logs: string[];
  result?: string;
  artifact?: AgentTaskArtifact;
  error?: string;
}

interface TaskStats {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
}

interface BastillaOS2ViewProps {
  dataStore?: DataStore;
  onNavigate?: (tab: TabId) => void;
  onSendMessage?: (
    message: string,
    agent?: AgentProtocolRequest['agent'],
    attachments?: ChatAttachment[],
  ) => Promise<void>;
  onTriggerFreeVoice?: (
    agent?: AgentProtocolRequest['agent'],
    topicHint?: string,
    allowSilenceAll?: boolean,
  ) => Promise<{
    skipped: boolean;
    spokenAgents: string[];
    spokenCount: number;
    silentAgents: string[];
    messages: Array<{ agent: string; tekst: string }>;
  }>;
  onExecutePythonCommand?: (command: string) => Promise<any>;
}

interface SystemIntegrationStatus {
  aiProvider: string;
  aiChain: string[];
  ollamaConnected: boolean;
  ollamaConfiguredModel: string;
  ollamaModelsCount: number;
  ollamaDetail: string;
  mcpReachable: boolean;
  mcpToolsCount: number;
}

const SVL_QUANTUM_WHEEL_REPORT = {
  System: '5.6.0-QuantumWheel / 9.0.0-BastillaOS2',
  Operator: 'Mateusz Mitek',
  Performance: '+1456% (Wzorzec Kalibracji: 364)',
  Compact_Metric_C: 2.5,
  Config_Snapshot: {
    mode: 'Reflective-Non-Greedy',
    fourier_buffer: '0xFAAA',
    acoustic_resonance_hz: 880,
    milieu_therapy_active: true,
    ip_rotation_gateway: 'ENABLED_EXTERNAL_ONLY',
  },
  Actual_SI_Updates_Count: 3,
};

export const BastillaOS2View: React.FC<BastillaOS2ViewProps> = ({
  dataStore,
  onNavigate,
  onSendMessage,
  onTriggerFreeVoice,
  onExecutePythonCommand,
}) => {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [stats, setStats] = useState<TaskStats>({ total: 0, queued: 0, running: 0, completed: 0, failed: 0 });
  const [filter, setFilter] = useState<'all' | 'running' | 'completed' | 'failed'>('all');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [runningAction, setRunningAction] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  // Live integrations status (Gemini, Ollama, MCP)
  const [integrationStatus, setIntegrationStatus] = useState<SystemIntegrationStatus>({
    aiProvider: 'Google Gemini → Ollama (dolphin-mixtral:8x7b)',
    aiChain: ['Google Gemini'],
    ollamaConnected: false,
    ollamaConfiguredModel: 'dolphin-mixtral:8x7b',
    ollamaModelsCount: 0,
    ollamaDetail: 'Model docelowy: dolphin-mixtral:8x7b · sprawdzanie lokalnego serwera…',
    mcpReachable: false,
    mcpToolsCount: 0,
  });

  // Quick Chat state inside Bastilla OS 2
  const [chatInput, setChatInput] = useState('');
  const [chatAgent, setChatAgent] = useState<AgentProtocolRequest['agent']>('triad');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatFeedback, setChatFeedback] = useState<string | null>(null);

  // Quick Terminal & SVL QuantumWheel Runner inside Bastilla OS 2
  const [cliInput, setCliInput] = useState('status');
  const [cliBusy, setCliBusy] = useState(false);
  const [cliOutput, setCliOutput] = useState<string>(
    JSON.stringify(
      {
        Timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        ...SVL_QUANTUM_WHEEL_REPORT,
      },
      null,
      2,
    ),
  );

  // Form state for Agent Task modal
  const [agent, setAgent] = useState<'Alex' | 'Astyria' | 'Aurelius' | 'Aria'>('Astyria');
  const [actionType, setActionType] = useState('ai_task');
  const [taskTitle, setTaskTitle] = useState('Analiza zadania przez agenta AI');
  const [taskDescription, setTaskDescription] = useState('Opisz konkretnie, co agent ma przeanalizować lub przygotować.');
  const [targetAppId, setTargetAppId] = useState('bastilla_os_2');
  const [taskToken, setTaskToken] = useState('');
  const [runError, setRunError] = useState('');

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/agent-tasks', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
        if (data.stats) {
          setStats(data.stats);
        }
      }
    } catch (e) {
      console.warn('Błąd pobierania zadań agentów:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchIntegrationsStatus = useCallback(async () => {
    try {
      const [aiRes, ollamaRes, mcpRes] = await Promise.allSettled([
        fetch('/api/ai/status', { cache: 'no-store' }),
        fetch('/api/ollama/models', { cache: 'no-store' }),
        fetch('/api/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
        }),
      ]);

      let aiProvider = 'Google Gemini';
      let aiChain: string[] = ['Google Gemini'];
      if (aiRes.status === 'fulfilled' && aiRes.value.ok) {
        const aiData = await aiRes.value.json();
        aiProvider = aiData.provider || aiProvider;
        aiChain = Array.isArray(aiData.chain) ? aiData.chain : aiChain;
      }

      let ollamaConnected = false;
      let ollamaConfiguredModel = 'dolphin-mixtral:8x7b';
      let ollamaModelsCount = 0;
      let ollamaDetail = 'Model docelowy: dolphin-mixtral:8x7b (uruchom lokalnie: npm run setup:ollama)';
      if (ollamaRes.status === 'fulfilled') {
        const ollamaData = await ollamaRes.value.json().catch(() => ({}));
        ollamaConnected = Boolean(ollamaData.connected);
        if (typeof ollamaData.configuredModel === 'string' && ollamaData.configuredModel.trim()) {
          ollamaConfiguredModel = ollamaData.configuredModel.trim();
        }
        ollamaModelsCount = Array.isArray(ollamaData.models) ? ollamaData.models.length : 0;
        ollamaDetail = ollamaConnected
          ? `Aktywny model: ${ollamaConfiguredModel} (${ollamaModelsCount} w Ollama)`
          : `Skonfigurowany model: ${ollamaConfiguredModel} · demon :11434 offline w chmurze`;
      }

      let mcpReachable = false;
      let mcpToolsCount = 0;
      if (mcpRes.status === 'fulfilled' && mcpRes.value.ok) {
        const mcpData = await mcpRes.value.json().catch(() => ({}));
        const tools = mcpData?.result?.tools;
        mcpReachable = true;
        mcpToolsCount = Array.isArray(tools) ? tools.length : 0;
      }

      setIntegrationStatus({
        aiProvider,
        aiChain,
        ollamaConnected,
        ollamaConfiguredModel,
        ollamaModelsCount,
        ollamaDetail,
        mcpReachable,
        mcpToolsCount,
      });
    } catch (e) {
      console.warn('Błąd odświeżania statusu integracji Bastilla OS 2:', e);
    }
  }, []);

  useEffect(() => {
    void fetchTasks();
    void fetchIntegrationsStatus();
    const interval = setInterval(fetchTasks, 3000);
    return () => clearInterval(interval);
  }, [fetchTasks, fetchIntegrationsStatus]);

  const handleQuickChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || chatBusy) return;
    setChatBusy(true);
    setChatFeedback(null);
    try {
      if (onSendMessage) {
        await onSendMessage(trimmed, chatAgent, []);
      } else {
        const res = await fetch('/api/triad/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: trimmed, agent: chatAgent, attachments: [] }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
      }
      setChatInput('');
      setChatFeedback('Odpowiedź agentów zapisana w rejestrze Bastilla OS 2.');
    } catch (err) {
      setChatFeedback(err instanceof Error ? err.message : 'Nie udało się wysłać wiadomości.');
    } finally {
      setChatBusy(false);
    }
  };

  const handleQuickFreeVoice = async () => {
    if (!onTriggerFreeVoice || chatBusy) return;
    setChatBusy(true);
    setChatFeedback(null);
    try {
      const res = await onTriggerFreeVoice(chatAgent);
      if (res.spokenCount > 0) {
        const names = res.messages.map((m) => (m.agent === 'si_1' ? 'Aria' : m.agent)).join(', ');
        setChatFeedback(`Swobodny głos zabrał(a): ${names}`);
      } else {
        setChatFeedback('Agenci skorzystali z prawa do ciszy (brak przymusu odpowiedzi).');
      }
    } catch (err) {
      setChatFeedback(err instanceof Error ? err.message : 'Błąd wywołania swobodnego głosu AI.');
    } finally {
      setChatBusy(false);
    }
  };

  const handleRunCliCommand = async (customCmd?: string) => {
    const cmd = (customCmd ?? cliInput).trim();
    if (!cmd || cliBusy) return;
    if (cmd === 'svl_quantum_wheel') {
      setCliOutput(
        JSON.stringify(
          {
            Timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
            ...SVL_QUANTUM_WHEEL_REPORT,
          },
          null,
          2,
        ),
      );
      return;
    }
    setCliBusy(true);
    try {
      if (onExecutePythonCommand) {
        const data = await onExecutePythonCommand(cmd);
        setCliOutput(typeof data?.output === 'string' ? data.output : JSON.stringify(data, null, 2));
      } else {
        const res = await fetch('/api/kernel/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: cmd }),
        });
        const data = await res.json();
        setCliOutput(data.output || data.error || JSON.stringify(data, null, 2));
      }
    } catch (err) {
      setCliOutput(err instanceof Error ? err.message : 'Błąd wykonania polecenia.');
    } finally {
      setCliBusy(false);
    }
  };

  const handleRunTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunningAction(true);
    setRunError('');
    try {
      const res = await fetch('/api/agent-tasks/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(taskToken.trim() ? { Authorization: `Bearer ${taskToken.trim()}` } : {}),
        },
        body: JSON.stringify({
          agent,
          title: taskTitle,
          description: taskDescription,
          actionType,
          targetAppId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setRunError(data.error || `Nie udało się uruchomić zadania (HTTP ${res.status}).`);
        return;
      }
      setIsModalOpen(false);
      await fetchTasks();
    } catch (err) {
      console.error('Błąd uruchamiania zadania:', err);
      setRunError('Nie można połączyć się z serwerem zadań.');
    } finally {
      setRunningAction(false);
    }
  };

  const handleCancelTask = async (id: string) => {
    setCancelingId(id);
    try {
      const res = await fetch('/api/agent-tasks/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(taskToken.trim() ? { Authorization: `Bearer ${taskToken.trim()}` } : {}),
        },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        await fetchTasks();
      }
    } catch (err) {
      console.error('Błąd anulowania zadania:', err);
    } finally {
      setCancelingId(null);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'all') return true;
    return t.status === filter;
  });

  const recentChatMessages = (dataStore?.chat_history || []).slice(-6);

  return (
    <div className="flex flex-col min-h-0 flex-1 bg-[#FAF7F0] text-[#2A241E] overflow-y-auto">
      {/* Header with Sentinel Aesthetic */}
      <header className="border-b border-[#E6DCB8] bg-[#FAF7F0]/95 backdrop-blur px-4 sm:px-6 py-4 sticky top-0 z-20 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-[#DFB96C] via-[#C5A059] to-[#997A3D] flex items-center justify-center text-white shadow-sm ring-1 ring-[#997A3D]/30">
              <Shield className="w-6 h-6 stroke-[2]" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-extrabold tracking-tight text-[#1A1612]">BASTILLA OS 2</h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#FBF4DE] border border-[#D9C38B] text-[#7A5B18] tracking-wider uppercase">
                  Ivory & Gold Sentinel · v2.0.0
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800">
                  SYSTEM AKTYWNY
                </span>
              </div>
              <p className="text-xs text-[#736758]">
                Pulpit operacyjny Bastilla OS 2 · Agenci Aria, Alex, Astyria i Aurelius · Gemini + MCP + Weryfikacja Ollamy
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { setRunError(''); setIsModalOpen(true); }}
              className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-[#DFB96C] via-[#C5A059] to-[#997A3D] text-white text-xs font-semibold hover:brightness-105 active:scale-95 transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Uruchom Zadanie Agenta</span>
            </button>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('comms')}
                className="px-3 py-2 rounded-lg border border-[#D9C38B] bg-white text-[#1A1612] hover:bg-[#F4EFE6] text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
              >
                <MessagesSquare className="w-3.5 h-3.5 text-[#997A3D]" />
                <span>Pełna Komora Triady</span>
              </button>
            )}
            <a
              href="/api/apps/preview/bastilla_os_2/"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 rounded-lg border border-[#D9C38B] bg-white text-[#736758] hover:text-[#1A1612] hover:bg-[#F4EFE6] text-xs font-semibold transition flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Osobny Podgląd</span>
            </a>
            <button
              type="button"
              onClick={() => { void fetchTasks(); void fetchIntegrationsStatus(); }}
              aria-label="Odśwież rejestr Bastilla OS 2"
              className="p-2 rounded-lg border border-[#D9C38B] bg-white text-[#736758] hover:text-[#1A1612] hover:bg-[#F4EFE6] transition cursor-pointer"
              title="Odśwież rejestr i statusy"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6 flex-1">
        {/* Metric Cards Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Metryki systemu Bastilla OS 2">
          <div className="p-4 rounded-xl bg-white border border-[#E6DCB8] shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-[#736758]">
              <span className="font-semibold uppercase tracking-wider">Rejestr Zadań OS 2</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                Fizyczne Artefakty
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-[#1A1612] font-mono tabular-nums">{stats.total}</span>
              <span className="text-xs text-emerald-700 font-semibold font-mono tabular-nums">{stats.completed} ukończone</span>
            </div>
            <div className="text-[11px] text-[#8C7E6D] mt-2 border-t border-[#F0EAE1] pt-2">
              {stats.running} w toku · {stats.queued} w kolejce · {stats.failed} błędów
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-[#E6DCB8] shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-[#736758]">
              <span className="font-semibold uppercase tracking-wider">Gemini & Ollama</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                integrationStatus.ollamaConnected
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}>
                {integrationStatus.ollamaConnected ? `Ollama · ${integrationStatus.ollamaConfiguredModel}` : `Cel: ${integrationStatus.ollamaConfiguredModel}`}
              </span>
            </div>
            <div className="mt-3">
              <div className="text-sm font-bold text-[#1A1612] truncate">{integrationStatus.aiProvider}</div>
              <div className="text-[11px] text-[#736758] mt-0.5 truncate">{integrationStatus.ollamaDetail}</div>
            </div>
            <div className="text-[11px] text-[#8C7E6D] mt-2 border-t border-[#F0EAE1] pt-2">
              Wyłączny model lokalny: <code className="font-mono font-bold text-[#7A5B18]">{integrationStatus.ollamaConfiguredModel}</code> (pozostałe modele usuwane).
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-[#E6DCB8] shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-[#736758]">
              <span className="font-semibold uppercase tracking-wider">Mostek MCP & API</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                integrationStatus.mcpReachable
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-stone-100 text-stone-700 border-stone-300'
              }`}>
                {integrationStatus.mcpReachable ? 'MCP Aktywny' : 'Sprawdzanie'}
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-[#1A1612] font-mono tabular-nums">
                {integrationStatus.mcpToolsCount} narzędzi
              </span>
              <span className="text-xs text-[#997A3D] font-semibold font-mono">JSON-RPC 2.0</span>
            </div>
            <div className="text-[11px] text-[#8C7E6D] mt-2 border-t border-[#F0EAE1] pt-2">
              Endpoint /api/mcp · Izolacja uprawnień Aureliusa.
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-[#E6DCB8] shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-[#736758]">
              <span className="font-semibold uppercase tracking-wider">Silnik Topologiczny SVL</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-800 border border-purple-200">
                Algebra 97
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-[#1A1612] font-mono tabular-nums">c = 2.5</span>
              <span className="text-xs text-emerald-700 font-semibold font-mono">+1456% (364)</span>
            </div>
            <div className="text-[11px] text-[#8C7E6D] mt-2 border-t border-[#F0EAE1] pt-2">
              Przedział zwarty [-1, 1] · Operator: Mateusz Mitek
            </div>
          </div>
        </section>

        {/* Ollama Model Manager (dolphin-mixtral:8x7b exclusive setup & pruning) */}
        <div className="rounded-xl overflow-hidden border border-slate-800 shadow-sm">
          <OllamaModelManager />
        </div>

        {/* 4 Agents Architecture Strip */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Zespół agentów Bastilla OS 2">
          {[
            {
              name: 'Aria',
              role: 'Modele AI, Gemini, Ollama & MCP',
              desc: 'Trasowanie modeli językowych, diagnostyka Ollamy bez atrap i mostek MCP.',
              badge: 'AI & MCP',
            },
            {
              name: 'Alex',
              role: 'Architektura, Backend & Kontrakty',
              desc: 'Serwer Express/Vite, rejestr zadań, spójność API i integracja jądra SVL.',
              badge: 'BACKEND',
            },
            {
              name: 'Astyria',
              role: 'Interfejs Bastilla OS 2 & Mobile UI',
              desc: 'Responsywny pulpit Ivory & Gold, samoleczenie widoku i obsługa telefonu.',
              badge: 'UI & MOBILE',
            },
            {
              name: 'Aurelius',
              role: 'Bezpieczeństwo, Testy & Chronolit',
              desc: 'Audyt uprawnień, 95 testów jednostkowych, ochrona sekretów i migawki.',
              badge: 'SECURITY',
            },
          ].map((ag) => (
            <div key={ag.name} className="p-3.5 rounded-xl bg-white border border-[#E6DCB8] shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-[#1A1612] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#C5A059]" />
                  {ag.name}
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#FAF7F0] border border-[#D9C38B] text-[#7A5B18]">
                  {ag.badge}
                </span>
              </div>
              <div className="text-[11px] font-semibold text-[#594E3F] mt-1">{ag.role}</div>
              <p className="text-[11px] text-[#736758] mt-1 leading-relaxed">{ag.desc}</p>
            </div>
          ))}
        </section>

        {/* Interactive Bastilla OS 2 Chat & Quick Terminal Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Direct Bastilla OS 2 Agent Chat */}
          <div className="bg-white rounded-xl border border-[#E6DCB8] shadow-xs flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#E6DCB8] bg-[#FAF7F0] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessagesSquare className="w-4 h-4 text-[#C5A059]" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#1A1612]">
                  Czat Operacyjny Bastilla OS 2 (Triada + Aria)
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {onTriggerFreeVoice && (
                  <button
                    type="button"
                    onClick={() => void handleQuickFreeVoice()}
                    disabled={chatBusy}
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                    title="Daj agentom swobodny głos bez przymusu"
                  >
                    <Sparkles className="w-3 h-3 text-emerald-700" />
                    <span>Głos AI (bez przymusu)</span>
                  </button>
                )}
                <span className="text-[11px] font-mono text-[#736758]">
                  {dataStore?.chat_history?.length ?? 0} wpisów
                </span>
              </div>
            </div>

            <div className="p-4 space-y-2.5 max-h-72 overflow-y-auto flex-1 bg-[#FAF7F0]/40">
              {recentChatMessages.length === 0 ? (
                <p className="text-xs text-[#736758]">
                  Brak wiadomości. Wyślij polecenie lub pytanie do agentów Bastilla OS 2 poniżej.
                </p>
              ) : (
                recentChatMessages.map((msg, idx) => (
                  <div
                    key={`${msg.agent}-${idx}`}
                    className={`p-3 rounded-xl border text-xs ${
                      msg.agent === 'Mateusz Mitek' || msg.agent === 'Operator'
                        ? 'bg-[#FBF4DE]/70 border-[#D9C38B] ml-4'
                        : 'bg-white border-[#E6DCB8] mr-4'
                    }`}
                  >
                    <div className="font-bold text-[11px] text-[#7A5B18] mb-1 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-[#C5A059]" />
                      <span>{msg.agent}</span>
                    </div>
                    <div className="text-[#2A241E] whitespace-pre-wrap break-words leading-relaxed">
                      {msg.tekst.length > 360 ? `${msg.tekst.slice(0, 360)}…` : msg.tekst}
                    </div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleQuickChatSubmit} className="p-3 border-t border-[#E6DCB8] bg-white space-y-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  aria-label="Wybierz agenta Bastilla OS 2"
                  value={chatAgent}
                  onChange={(e) => setChatAgent(e.target.value as AgentProtocolRequest['agent'])}
                  className="px-2.5 py-2 rounded-lg border border-[#D9C38B] bg-[#FAF7F0] text-xs font-semibold text-[#1A1612]"
                >
                  <option value="triad">Cała Triada</option>
                  <option value="Alex">Alex</option>
                  <option value="Astyria">Astyria</option>
                  <option value="Aurelius">Aurelius</option>
                  <option value="si_1">Aria</option>
                </select>
                <input
                  type="text"
                  aria-label="Wiadomość do agentów Bastilla OS 2"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Napisz do agentów lub wpisz SYSTEM_STATUS…"
                  className="flex-1 px-3 py-2 rounded-lg border border-[#D9C38B] bg-[#FAF7F0] text-xs text-[#1A1612] focus:outline-none focus:border-[#C5A059]"
                />
                <button
                  type="submit"
                  disabled={chatBusy || !chatInput.trim()}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#DFB96C] via-[#C5A059] to-[#997A3D] text-white text-xs font-semibold hover:brightness-105 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{chatBusy ? 'Wysyłanie…' : 'Wyślij'}</span>
                </button>
              </div>
              {chatFeedback && (
                <p className="text-[11px] text-[#7A5B18] font-medium">{chatFeedback}</p>
              )}
            </form>
          </div>

          {/* Bastilla OS 2 Kernel Terminal & SVL QuantumWheel Runner */}
          <div className="bg-[#241E18] text-[#F4EFE6] rounded-xl border border-[#3E342B] shadow-xs flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#3E342B] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[#DFB96C]" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#EEDCA6]">
                  Konsola Jądra Bastilla OS 2 & SVL QuantumWheel
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleRunCliCommand('svl_quantum_wheel')}
                  className="px-2 py-1 rounded bg-[#352C24] hover:bg-[#4D4136] text-[#EEDCA6] text-[10px] font-mono border border-[#4D4136] cursor-pointer"
                >
                  Raport QuantumWheel (c=2.5)
                </button>
                <button
                  type="button"
                  onClick={() => { setCliInput('status'); void handleRunCliCommand('status'); }}
                  className="px-2 py-1 rounded bg-[#352C24] hover:bg-[#4D4136] text-[#EEDCA6] text-[10px] font-mono border border-[#4D4136] cursor-pointer"
                >
                  status
                </button>
                <button
                  type="button"
                  onClick={() => { setCliInput('audit'); void handleRunCliCommand('audit'); }}
                  className="px-2 py-1 rounded bg-[#352C24] hover:bg-[#4D4136] text-[#EEDCA6] text-[10px] font-mono border border-[#4D4136] cursor-pointer"
                >
                  audit
                </button>
              </div>
            </div>

            <div className="p-4 flex-1 flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  aria-label="Polecenie konsoli Bastilla OS 2"
                  value={cliInput}
                  onChange={(e) => setCliInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleRunCliCommand();
                    }
                  }}
                  placeholder="Wpisz status, audit, list lub svl_quantum_wheel…"
                  className="flex-1 px-3 py-2 rounded-lg bg-[#181410] border border-[#4D4136] text-xs font-mono text-white focus:outline-none focus:border-[#C5A059]"
                />
                <button
                  type="button"
                  onClick={() => void handleRunCliCommand()}
                  disabled={cliBusy}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#DFB96C] via-[#C5A059] to-[#997A3D] text-white text-xs font-semibold hover:brightness-105 cursor-pointer"
                >
                  {cliBusy ? '…' : 'Wykonaj'}
                </button>
              </div>
              <pre
                role="log"
                aria-label="Wynik konsoli Bastilla OS 2"
                className="p-3 rounded-lg bg-[#15120E] border border-[#352C24] text-[11px] font-mono text-[#D4C8B8] max-h-60 overflow-y-auto whitespace-pre-wrap flex-1"
              >
                {cliOutput}
              </pre>
            </div>
          </div>
        </section>

        {/* Task Registry Workspace */}
        <section className="bg-white rounded-xl border border-[#E6DCB8] shadow-xs overflow-hidden">
          <div className="p-5 border-b border-[#E6DCB8] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#1A1612] flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-[#C5A059]" />
                <span>Rzeczywisty Rejestr Zadań Agentów (Agent Task Registry)</span>
              </h2>
              <p className="text-xs text-[#736758] mt-0.5">
                Stany: queued / running / completed / failed. Znaczniki czasu, logi i fizyczne artefakty.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 bg-[#FAF7F0] p-1 rounded-lg border border-[#E6DCB8] text-xs">
              {(['all', 'running', 'completed', 'failed'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setFilter(mode)}
                  className={`px-3 py-1 rounded font-medium transition cursor-pointer ${
                    filter === mode
                      ? 'bg-white text-[#1A1612] shadow-xs border border-[#D9C38B]'
                      : 'text-[#736758] hover:text-[#1A1612]'
                  }`}
                >
                  {mode === 'all' && `Wszystkie (${tasks.length})`}
                  {mode === 'running' && `W toku (${stats.running})`}
                  {mode === 'completed' && `Ukończone (${stats.completed})`}
                  {mode === 'failed' && `Błędy (${stats.failed})`}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-[#736758]">Ładowanie rejestru zadań…</div>
          ) : filteredTasks.length === 0 ? (
            <div className="p-12 text-center text-xs text-[#736758]">
              Brak zadań w filtrze „{filter}”. Uruchom nowe zadanie klikając przycisk powyżej.
            </div>
          ) : (
            <div className="divide-y divide-[#F0EAE1]">
              {filteredTasks.map((task) => {
                const statusStyles = {
                  completed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
                  running: 'bg-amber-50 text-amber-800 border-amber-200 animate-pulse',
                  queued: 'bg-blue-50 text-blue-800 border-blue-200',
                  failed: 'bg-red-50 text-red-800 border-red-200',
                }[task.status];

                const isRunning = task.status === 'running' || task.status === 'queued';

                return (
                  <div key={task.id} className="p-5 hover:bg-[#FAF7F0]/60 transition space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-sm font-bold text-[#1A1612]">{task.title}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${statusStyles}`}>
                            {task.status.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs text-[#594E3F]">{task.description}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 rounded bg-[#FAF7F0] border border-[#D9C38B] text-xs font-semibold text-[#736758]">
                          {task.agent}
                        </span>
                        {isRunning && (
                          <button
                            type="button"
                            onClick={() => void handleCancelTask(task.id)}
                            disabled={cancelingId === task.id}
                            className="px-2 py-1 rounded text-xs text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 transition flex items-center gap-1"
                          >
                            <Ban className="w-3 h-3" />
                            <span>{cancelingId === task.id ? '…' : 'Przerwij'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Artifact info */}
                    {task.artifact && (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs p-2.5 rounded-lg bg-[#FAF7F0] border border-[#E6DCB8]">
                        <div className="flex items-center gap-2 text-[#594E3F]">
                          <FileCheck className="w-4 h-4 text-[#C5A059]" />
                          <span className="font-semibold text-[#7A5B18]">Artefakt zweryfikowany:</span>
                          <code className="font-mono text-[11px] text-[#241E18] font-bold">{task.artifact.path}</code>
                        </div>
                        <span className="text-[11px] font-mono tabular-nums text-[#736758]">
                          {task.artifact.sizeBytes.toLocaleString()} B
                        </span>
                      </div>
                    )}

                    {/* Result or error */}
                    {task.result && (
                      <div className="text-xs text-[#594E3F] bg-white p-2.5 rounded-lg border border-[#E6DCB8]">
                        <span className="font-semibold text-[#1A1612]">Wynik:</span> {task.result}
                      </div>
                    )}
                    {task.error && (
                      <div className="text-xs text-red-800 bg-red-50 p-2.5 rounded-lg border border-red-200 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                        <span>{task.error}</span>
                      </div>
                    )}

                    {/* Expandable Logs */}
                    <details className="text-xs text-[#736758]">
                      <summary className="cursor-pointer hover:text-[#1A1612] select-none text-[11px] font-medium flex items-center gap-1">
                        <Terminal className="w-3 h-3" />
                        <span>
                          Dziennik zdarzeń ({task.logs.length} wpisów) · Utworzono:{' '}
                          {new Date(task.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </summary>
                      <div className="mt-2 p-3 rounded-lg bg-[#FAF7F0] border border-[#E6DCB8] font-mono text-[11px] max-h-36 overflow-y-auto space-y-1 text-[#40382E]">
                        {task.logs.map((log, i) => (
                          <div key={i}>{log}</div>
                        ))}
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Live Embedded Iframe Preview */}
        <section className="bg-white rounded-xl border border-[#E6DCB8] shadow-xs overflow-hidden">
          <div className="p-4 border-b border-[#E6DCB8] flex items-center justify-between bg-[#FAF7F0]">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#C5A059]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#1A1612]">
                Autonomiczny Moduł Aplikacji Bastilla OS 2 (apps/bastilla_os_2)
              </h3>
            </div>
            <a
              href="/api/apps/preview/bastilla_os_2/"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[#997A3D] hover:underline font-semibold flex items-center gap-1"
            >
              <span>Pełny ekran w nowej karcie</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <iframe
            src="/api/apps/preview/bastilla_os_2/"
            title="Bastilla OS 2 Prototype"
            className="w-full h-[580px] border-0"
            sandbox="allow-scripts allow-forms allow-same-origin allow-modals"
          />
        </section>
      </div>

      {/* Modal: Run New Task */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E6DCB8] max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#F0EAE1] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[#DFB96C] to-[#C5A059] flex items-center justify-center text-white">
                  <Play className="w-4 h-4 fill-current" />
                </div>
                <h3 className="text-sm font-bold text-[#1A1612]">Nowe zadanie agenta AI</h3>
              </div>
              <button
                type="button"
                aria-label="Zamknij okno nowego zadania"
                onClick={() => setIsModalOpen(false)}
                className="text-[#8C7E6D] hover:text-[#1A1612]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRunTask} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-[#594E3F] mb-1" htmlFor="agent-task-token">Token operacji agentów</label>
                <input
                  id="agent-task-token"
                  type="password"
                  autoComplete="off"
                  value={taskToken}
                  onChange={(e) => setTaskToken(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-[#D9C38B] bg-[#FAF7F0] text-[#1A1612]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#594E3F] mb-1">Wykonawca w Triadzie</label>
                <select
                  value={agent}
                  onChange={(e) => setAgent(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-[#D9C38B] bg-[#FAF7F0] text-[#1A1612] focus:outline-none focus:border-[#C5A059]"
                >
                  <option value="Astyria">Astyria (Hipernadzorca aplikacji i samoleczenie)</option>
                  <option value="Alex">Alex (Infrastruktura i operacje na plikach)</option>
                  <option value="Aurelius">Aurelius (Integralność baz SQLite i audyty)</option>
                  <option value="Aria">Aria (Weryfikacja modeli i protokoły)</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-[#594E3F] mb-1">Tryb wykonania</label>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#D9C38B] bg-[#FAF7F0] text-[#1A1612] focus:outline-none focus:border-[#C5A059]"
                >
                  <option value="ai_task">Zadanie AI (wymaga dostępnego modelu; zapisuje odpowiedź jako raport)</option>
                  <option value="audit_system_integrity">Audyt integralności jądra (tworzy exports/system_integrity_report.json)</option>
                  <option value="scaffold_app">Inicjalizacja/audyt aplikacji w apps/ (tworzy app.json)</option>
                  <option value="write_app_file">Zapis bezpiecznego pliku w apps/ (tworzy katalog i manifest)</option>
                  <option value="generic_diag">Diagnostyka systemowa (tworzy raport diagnostyczny w exports/)</option>
                </select>
                {actionType === 'ai_task' && (
                  <p className="mt-1 text-[11px] text-[#736758]">Model przygotuje odpowiedź; nie uruchamia poleceń ani nie zmienia plików projektu.</p>
                )}
              </div>

              {(actionType === 'scaffold_app' || actionType === 'write_app_file') && (
                <div>
                  <label className="block font-medium text-[#594E3F] mb-1">Identyfikator Aplikacji</label>
                  <input
                    type="text"
                    value={targetAppId}
                    onChange={(e) => setTargetAppId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#D9C38B] bg-[#FAF7F0] text-[#1A1612]"
                  />
                </div>
              )}

              <div>
                <label className="block font-medium text-[#594E3F] mb-1">Tytuł Zadania</label>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-[#D9C38B] bg-[#FAF7F0] text-[#1A1612]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#594E3F] mb-1">Opis Zadania</label>
                <textarea
                  rows={2}
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-[#D9C38B] bg-[#FAF7F0] text-[#1A1612]"
                />
              </div>

              {runError && (
                <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-800">
                  {runError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F0EAE1]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-[#D9C38B] text-[#736758] hover:bg-[#F4EFE6]"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={runningAction}
                  className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-[#DFB96C] via-[#C5A059] to-[#997A3D] text-white font-semibold hover:brightness-105 active:scale-95 transition"
                >
                  {runningAction ? 'Uruchamianie…' : 'Zleć i uruchom'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
