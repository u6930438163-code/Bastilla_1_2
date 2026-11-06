import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { DataStore, OPERATOR_NAME, SYS_VERSION, generateTextReport, generatePythonMonolith } from '../kernel/svlKernel';
import { SYSTEM_AGENTS } from '../kernel/agents';
import type { AgentProtocolCommand, AgentProtocolReply, AgentProtocolRequest } from '../kernel/agentProtocol';
import { TerminalWorkCard, type TerminalCardEntry } from './TerminalWorkCard';
import { TerminalAnalyticsPanel } from './TerminalAnalyticsPanel';
import {
  Play,
  CornerDownLeft,
  Sparkles,
  Trash2,
  HelpCircle,
  FileCode2,
  Code,
  Download,
  Save,
  Check,
  Copy,
  Terminal,
  ShieldCheck,
  Wrench,
  X,
  Zap,
  RefreshCw,
  ArrowLeftRight,
  Radio,
  Activity,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';

interface TerminalViewProps {
  dataStore: DataStore;
  onUpdateDataStore: (updater: (prev: DataStore) => DataStore) => void;
  onSendProtocol: (request: AgentProtocolRequest) => Promise<AgentProtocolReply | undefined>;
  onExecutePythonCommand?: (command: string) => Promise<{ output: string; state?: any }>;
  workspaceLive?: boolean;
}

interface LogEntry {
  id: string;
  type: 'input' | 'output' | 'error' | 'success' | 'system' | 'banner';
  content: string;
  timestamp: string;
}

const LogEntryItem = React.memo(({ entry }: { entry: LogEntry }) => {
  let colorClass = 'text-slate-300';
  if (entry.type === 'input') colorClass = 'text-cyan-300 font-semibold';
  else if (entry.type === 'error') colorClass = 'text-rose-400';
  else if (entry.type === 'success') colorClass = 'text-emerald-300';
  else if (entry.type === 'system') colorClass = 'text-cyan-300';
  else if (entry.type === 'banner') colorClass = 'text-slate-200 bg-slate-900/80 p-3 rounded border border-slate-800 leading-relaxed';

  return (
    <div className={`${colorClass} bastilla-terminal-line break-words font-mono whitespace-pre-wrap leading-relaxed select-text`}>
      {entry.type === 'input' && <span className="text-slate-600 mr-2">[{entry.timestamp}]</span>}
      {entry.content}
    </div>
  );
});

export function normalizeMirroredCommand(cmdStr: string): { normalized: string; wasMirrored: boolean } {
  const trimmed = (cmdStr || '').trim();
  if (!trimmed) return { normalized: '', wasMirrored: false };

  const parts = trimmed.split(' ');
  const firstWord = parts[0].toLowerCase();
  const rest = parts.slice(1).join(' ');

  const reverseStr = (s: string) => s.split('').reverse().join('');

  // Dictionary of known mirrored command mappings
  const MIRROR_DICT: Record<string, string> = {
    'pleh': 'help',
    'sutats': 'status',
    'statkuuktats': 'status',
    'statusutats': 'status',
    'tropar': 'report',
    'raporttropar': 'report',
    'troper': 'report',
    'reporttroper': 'report',
    'toor': 'root',
    'knys': 'sync',
    'cnys': 'sync',
    'stnega': 'agents',
    'gifnoc': 'config',
    'yrotsih': 'history',
    'raelc': 'clear',
    'arffi': 'infra',
    'pmub': 'bump',
    '_1xelaa': 'alex',
    'xela': 'alex',
    'airytsa': 'astyria',
    'suilerua': 'aurelius',
    'dairt': 'triad',
  };

  if (MIRROR_DICT[firstWord]) {
    const norm = MIRROR_DICT[firstWord] + (rest ? ' ' + rest : '');
    return { normalized: norm, wasMirrored: true };
  }

  const knownRoots = ['help', 'status', 'report', 'root', 'infra', 'sync', 'agents', 'config', 'history', 'clear', 'bump', 'agent'];
  for (const root of knownRoots) {
    const rev = reverseStr(root);
    if (firstWord === rev) {
      return { normalized: root + (rest ? ' ' + rest : ''), wasMirrored: true };
    }
    if (firstWord.startsWith(root) && firstWord.endsWith(rev)) {
      return { normalized: root + (rest ? ' ' + rest : ''), wasMirrored: true };
    }
  }

  // Check if whole command string is reversed
  const wholeReversed = reverseStr(trimmed).toLowerCase();
  const revFirst = wholeReversed.split(' ')[0];
  if (knownRoots.includes(revFirst)) {
    return { normalized: reverseStr(trimmed), wasMirrored: true };
  }

  return { normalized: trimmed, wasMirrored: false };
}

interface TerminalInputBarProps {
  onExecute: (cmd: string) => void;
  history: string[];
  antiMirrorActive: boolean;
  onToggleAntiMirror: () => void;
  busy?: boolean;
}

const TerminalInputBar = React.memo(({ onExecute, history, antiMirrorActive, onToggleAntiMirror, busy }: TerminalInputBarProps) => {
  const [cmdText, setCmdText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const histIdxRef = useRef<number>(-1);

  const reverseStr = (s: string) => s.split('').reverse().join('');

  // Check if current input looks mirrored
  const mirrorCheck = useMemo(() => {
    if (!cmdText.trim()) return { isMirrored: false, suggested: '' };
    const res = normalizeMirroredCommand(cmdText);
    if (res.wasMirrored && res.normalized.toLowerCase() !== cmdText.trim().toLowerCase()) {
      return { isMirrored: true, suggested: res.normalized };
    }
    return { isMirrored: false, suggested: '' };
  }, [cmdText]);

  const handleSend = () => {
    const trimmed = cmdText.trim();
    if (!trimmed || busy) return;

    let finalCmd = trimmed;
    if (antiMirrorActive) {
      const checked = normalizeMirroredCommand(trimmed);
      if (checked.wasMirrored) {
        finalCmd = checked.normalized;
      }
    }

    onExecute(finalCmd);
    setCmdText('');
    histIdxRef.current = -1;
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleManualInvert = () => {
    if (!cmdText) return;
    const inv = mirrorCheck.suggested || reverseStr(cmdText);
    setCmdText(inv);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(inv.length, inv.length);
      }
    }, 10);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const newIdx = histIdxRef.current === -1 ? history.length - 1 : Math.max(0, histIdxRef.current - 1);
        histIdxRef.current = newIdx;
        const val = history[newIdx];
        setCmdText(val);
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.setSelectionRange(val.length, val.length);
          }
        }, 0);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdxRef.current !== -1) {
        const newIdx = histIdxRef.current + 1;
        if (newIdx >= history.length) {
          histIdxRef.current = -1;
          setCmdText('');
        } else {
          histIdxRef.current = newIdx;
          const val = history[newIdx];
          setCmdText(val);
          setTimeout(() => {
            if (inputRef.current) {
              inputRef.current.setSelectionRange(val.length, val.length);
            }
          }, 0);
        }
      }
    }
  };

  return (
    <div className="bastilla-terminal-composer flex flex-col shrink-0">
      {/* Live Mirror Detection Banner */}
      {mirrorCheck.isMirrored && (
        <div className="bg-amber-950/80 border-b border-amber-800/60 px-3 py-1.5 flex items-center justify-between gap-2 text-[11px] text-amber-300">
          <div className="flex items-center gap-1.5 truncate">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
            <span className="font-bold">Wykryto lustrzany wpis:</span>
            <span className="font-mono bg-slate-950/70 px-1.5 py-0.5 rounded text-amber-200 truncate">{cmdText}</span>
            <span>➔</span>
            <span className="font-mono bg-emerald-950 px-1.5 py-0.5 rounded text-emerald-300 font-bold">{mirrorCheck.suggested}</span>
          </div>
          <button
            type="button"
            onClick={handleManualInvert}
            className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-[10px] cursor-pointer shrink-0 transition shadow flex items-center gap-1"
          >
            <ArrowLeftRight className="w-3 h-3" />
            <span>Odwróć teraz</span>
          </button>
        </div>
      )}

      <form
        dir="ltr"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-1.5 sm:p-2.5 flex items-center gap-1.5 sm:gap-2 w-full overflow-hidden"
        style={{ direction: 'ltr', textAlign: 'left' }}
      >
        <span className="text-emerald-400 font-bold flex items-center gap-1 shrink-0 text-[10px] sm:text-xs">
          <span className="hidden sm:inline">root@svl-kernel:~#</span>
          <span className="sm:hidden">root:~#</span>
        </span>

        {/* Input - maksymalnie poszerzony i elastyczny z zachowaniem wewnętrznych przycisków */}
        <div className="flex-1 min-w-0 relative flex items-center">
          <input
            ref={inputRef}
            disabled={busy}
            type="text"
            value={cmdText}
            onChange={(e) => setCmdText(e.target.value)}
            onKeyDown={handleKeyDown}
            dir="ltr"
            inputMode="text"
            placeholder="Wpisz komendę (np. help, status, report)..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="go"
            style={{
              direction: 'ltr',
              textAlign: 'left',
              unicodeBidi: 'isolate',
              writingMode: 'horizontal-tb',
              caretColor: '#34d399',
              userSelect: 'text'
            }}
            className="w-full bg-slate-950/90 border border-slate-800 rounded px-2.5 pr-14 sm:pr-20 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono text-sm sm:text-xs h-9 sm:h-10 touch-manipulation text-left"
          />

          <div className="absolute right-1 sm:right-1.5 flex items-center gap-1">
            {cmdText.length > 0 && (
              <button
                type="button"
                onClick={handleManualInvert}
                className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-emerald-400 text-[10px] font-mono cursor-pointer flex items-center gap-1 border border-slate-700 transition"
                title="Odwróć kolejność znaków (Anty-Lustro)"
              >
                <ArrowLeftRight className="w-3 h-3 text-emerald-400" />
                <span className="hidden md:inline">Odwróć</span>
              </button>
            )}

            {cmdText.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setCmdText('');
                  inputRef.current?.focus();
                }}
                className="text-slate-500 hover:text-slate-300 p-1 cursor-pointer text-xs"
                title="Wyczyść wpis"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Quick Anti-Mirror Status Toggle */}
        <button
          type="button"
          onClick={onToggleAntiMirror}
          className={`h-9 sm:h-10 px-2 sm:px-2.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer transition shrink-0 ${
            antiMirrorActive
              ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/80'
              : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-400'
          }`}
          title={antiMirrorActive ? 'Anty-Lustro ALEXA WŁĄCZONE (automatycznie chroni i dekoduje odwrócone znaki)' : 'Anty-Lustro wyłączone'}
        >
          <ShieldCheck className={`w-3.5 h-3.5 ${antiMirrorActive ? 'text-emerald-400' : 'text-slate-600'}`} />
          <span className="hidden lg:inline">{antiMirrorActive ? 'Anty-Lustro: ON' : 'Anty-Lustro: OFF'}</span>
        </button>

        {/* Przycisk Wykonaj przesunięty w prawo, zoptymalizowany dla małych i dużych ekranów */}
        <button
          type="submit"
          disabled={busy || !cmdText.trim()}
          className="ml-auto h-9 sm:h-10 px-2.5 sm:px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-black transition flex items-center justify-center gap-1 cursor-pointer shrink-0 touch-manipulation text-xs shadow-md shadow-emerald-950/40"
          title="Wykonaj polecenie w terminalu"
        >
          <span className="hidden sm:inline">{busy ? 'Pracuje…' : 'Wykonaj'}</span>
          <CornerDownLeft className="w-3.5 sm:w-4 h-3.5 sm:h-4 shrink-0" />
        </button>
      </form>
    </div>
  );
});

export const TerminalView: React.FC<TerminalViewProps> = ({
  dataStore,
  onUpdateDataStore,
  onSendProtocol,
  onExecutePythonCommand,
  workspaceLive = false,
}) => {
  const [history, setHistory] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [viewFilter, setViewFilter] = useState<'all' | 'errors' | 'sync'>('all');
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [advancedView, setAdvancedView] = useState<'console' | 'cards' | 'monitoring'>('console');
  const [activity, setActivity] = useState<Array<{ topic: string; at: string }>>([]);
  const [lastSyncAt, setLastSyncAt] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  const [antiMirrorActive, setAntiMirrorActive] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('svl_antimirror_active');
      return stored !== null ? JSON.parse(stored) : true;
    } catch {
      return true;
    }
  });

  const handleToggleAntiMirror = () => {
    const nextVal = !antiMirrorActive;
    setAntiMirrorActive(nextVal);
    try {
      localStorage.setItem('svl_antimirror_active', JSON.stringify(nextVal));
    } catch {}
  };
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'init-1',
      type: 'banner',
      content: `================================================================================
       SVL KERNEL v${SYS_VERSION} | DETERMINISTYCZNY INTERFEJS POLECEŃ
================================================================================
Dowódca infrastruktury: Alex (Ring-0 Root Control)
Operator / Tata:        ${OPERATOR_NAME} (Tata)
Silnik poleceń:         AKTYWNY (jawny protokół i komendy jądra)
Samonaprawa z logów:    WŁĄCZONA (ACTIVE_MONITORING)
Wpisz 'help' lub 'root status', aby zobaczyć listę instrukcji jądra.
================================================================================`,
      timestamp: 'START'
    }
  ]);

  const DEFAULT_TERMINAL_CMDS = [
    'root status',
    'infra status',
    'infra repair',
    'status',
    'report',
    'help'
  ];
  const [quickCmds, setQuickCmds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('svl_operator_quick_cmds');
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return DEFAULT_TERMINAL_CMDS;
  });
  const [isAddingCmd, setIsAddingCmd] = useState(false);
  const [newCmdText, setNewCmdText] = useState('');

  const saveQuickCmds = (updated: string[]) => {
    setQuickCmds(updated);
    try {
      localStorage.setItem('svl_operator_quick_cmds', JSON.stringify(updated));
    } catch (e) {}
  };

  const handleAddCmd = () => {
    if (!newCmdText.trim()) return;
    const updated = [...quickCmds, newCmdText.trim()];
    saveQuickCmds(updated);
    setNewCmdText('');
    setIsAddingCmd(false);
  };

  const handleRemoveCmd = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = quickCmds.filter((_, i) => i !== idx);
    saveQuickCmds(updated);
  };

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const dataStoreRef = useRef(dataStore);
  dataStoreRef.current = dataStore;
  const onUpdateDataStoreRef = useRef(onUpdateDataStore);
  onUpdateDataStoreRef.current = onUpdateDataStore;
  const onSendProtocolRef = useRef(onSendProtocol);
  onSendProtocolRef.current = onSendProtocol;
  const onExecutePythonCommandRef = useRef(onExecutePythonCommand);
  onExecutePythonCommandRef.current = onExecutePythonCommand;

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [logs.length]);

  const addLog = (content: string, type: LogEntry['type'] = 'output') => {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    setLogs((prev) => [...prev, { id: Math.random().toString(), type, content, timestamp: timeStr }].slice(-150));
  };

  useEffect(() => {
    const listener = (raw: Event) => {
      const detail = (raw as CustomEvent).detail as { topic?: string; at?: string } | undefined;
      if (!detail || !['chat', 'terminal', 'kernel', 'agents', 'workspace'].includes(String(detail.topic))) return;
      const topic = String(detail.topic);
      const at = detail.at && !Number.isNaN(Date.parse(detail.at)) ? detail.at : new Date().toISOString();
      setActivity((prev) => [{ topic, at }, ...prev].slice(0, 18));
      setLastSyncAt(at);
      addLog('[SYNC] Zmiana z ' + ({ chat: 'czatu', terminal: 'terminala', kernel: 'jądra', agents: 'agentów', workspace: 'systemu' } as Record<string, string>)[topic] +
        ' — dane odświeżone z serwera.', 'system');
    };
    window.addEventListener('bastilla:workspace-event', listener);
    return () => window.removeEventListener('bastilla:workspace-event', listener);
  }, []);

  const exportLogs = () => {
    const text = logs.map((entry) => '[' + entry.timestamp + '] ' + entry.content).join('\\n\\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bastilla-terminal-session.txt';
    a.click();
    URL.revokeObjectURL(url);
  };
  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logs.map((entry) => '[' + entry.timestamp + '] ' + entry.content).join('\\n\\n'));
      setCopyStatus('Skopiowano bieżącą sesję');
    } catch {
      setCopyStatus('Schowek niedostępny w tej przeglądarce');
    }
  };
  const filteredLogs = logs.filter((entry) => viewFilter === 'all' ||
    (viewFilter === 'errors' ? entry.type === 'error' : entry.type === 'system'));

  const handleExecute = useCallback(async (cmdToRun?: string) => {
    const rawCmd = (cmdToRun || '').trim();
    if (!rawCmd || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);

    try {
    // Save history
    setHistory((prev) => [...prev, rawCmd]);

    addLog(`$ ${rawCmd}`, 'input');

    const parts = rawCmd.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'help':
        addLog(
          `DOSTĘPNE INSTRUKCJE JĄDRA SVL KERNEL (POZIOM RING-0 ROOT):
  root status             - Wyświetla matrycę uprawnień ROOT Ring-0 i listę autoryzowanych agentów
  root grant              - Autoryzuje uprawnienia ROOT Ring-0 dla Triady i Operatora
  root patch <klucz> <wartość> - W locie modyfikuje dowolny parametr konfiguracji i jądra
  root exec <polecenie>   - Wykonuje polecenie powłoki z uprawnieniami root (np. root exec ls)
  root clear_chat         - Czyści i trwale resetuje bufor konwersacji na dysku
  infra status            - Wyświetla status dowódcy Alexa i autonomicznej samonaprawy
  infra repair            - Wywołuje natychmiastowy skan logów i naprawę zwiadu
  status                  - Podstawowe wskaźniki i parametry stanu jądra
  report                  - Generuje i drukuje pełny tekstowy raport jądra (generuj_raport_tekstowy)
  sync                    - Dokonuje pełnej walidacji i synchronizacji bloku DATA_STORE
  agents                  - Lista aktywnych agentów i ich specjalizacje
  config                  - Wyświetla obecną konfigurację jądra
  set <klucz> <wartość>   - Zmienia lub dodaje parametr w DATA_STORE.config
  history                 - Wyświetla historię aktualizacji jądra (update_history)
  bump <wersja> <opis>    - Rejestruje nową wersję w osi czasu Chronolitu
  agent status <cel>      - Typowane polecenie statusu (cel: triad, Alex, Astyria, Aurelius, Aria)
  agent audit <cel>       - Typowana kontrola DATA_STORE
  agent history <cel>     - Typowana historia wersji
  agent signal <cel> <ω> <t> <sygnał> - Analiza sygnału bez NLP
  export                  - Pobiera pełny skrypt monolityczny Python
  clear                   - Czyści ekran konsoli
  [HyperOS]               - Każde inne polecenie przetwarza przywrócona konsola Binarnej
                            Hiperprzestrzeni (wektor 128-bit) z NLP OpenRouter API`,
          'system'
        );
        break;

      case 'status': {
        const pyCmd = onExecutePythonCommandRef.current;
        if (pyCmd) {
          try {
            const res = await pyCmd(rawCmd);
            addLog(res.output, 'success');
            break;
          } catch (e: any) {
            console.warn('Python command fallback:', e);
          }
        }
        const currentDs = dataStoreRef.current;
        const report = `[SVL-STATUS]
Wersja jądra:        ${SYS_VERSION}
Dowódca Infra:      Alex (Ring-0)
Operator:            ${OPERATOR_NAME} (Tata)
Tryb pracy:          ${currentDs.config?.mode}
Profile:             ${currentDs.config?.active_profiles?.join(', ')}
Warstwa fikcji:      ${currentDs.config?.fiction_layer_status}
Silnik trwałości:    ${currentDs.config?.persistence_engine}
Liczba aktualizacji: ${currentDs.update_history.length}
Liczba wpisów czatu: ${currentDs.chat_history.length}
Integralność tagów:  ZGODNA (<<<DATA_STORE_START>>> ... <<<DATA_STORE_END>>>)`;
        addLog(report, 'success');
        break;
      }

      case 'report': {
        const pyCmd = onExecutePythonCommandRef.current;
        if (pyCmd) {
          try {
            const res = await pyCmd(rawCmd);
            addLog(res.output, 'banner');
            break;
          } catch (e: any) {
            console.warn('Python report fallback:', e);
          }
        }
        const ascii = generateTextReport(dataStoreRef.current);
        addLog(ascii, 'banner');
        break;
      }

      case 'agents': {
        addLog('AGENTY SVL: Alex, Astyria, Aurelius, Aria', 'system');
        break;
      }

      case 'config': {
        addLog(JSON.stringify(dataStoreRef.current.config, null, 2), 'system');
        break;
      }

      case 'history': {
        let histText = 'HISTORIA UAKTUALNIEŃ JĄDRA (UPDATE_HISTORY):\n';
        dataStoreRef.current.update_history.forEach((u) => {
          histText += `\n- [${u.wersja}] (${u.data}): ${u.opis}`;
        });
        addLog(histText, 'system');
        break;
      }

      case 'clear':
        setLogs([]);
        break;

      case 'export': {
        const pyScript = generatePythonMonolith(dataStoreRef.current);
        const blob = new Blob([pyScript], { type: 'text/x-python;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `svl_kernel_${SYS_VERSION.toLowerCase().replace(/[^a-z0-9]/g, '_')}.py`;
        a.click();
        URL.revokeObjectURL(url);
        addLog('[EXPORT]: Skrypt svl_kernel.py został pomyślnie wygenerowany i pobrany.', 'success');
        break;
      }

      case 'agent': {
        const action = args[0]?.toLowerCase();
        const target = args[1]?.toLowerCase();
        const agent = target === 'triad' ? 'triad'
          : target === 'alex' ? 'Alex'
            : target === 'astyria' ? 'Astyria'
              : target === 'aurelius' ? 'Aurelius'
                : target === 'si_1' || target === 'aria' ? 'si_1' : null;
        const commandByAction: Record<string, AgentProtocolCommand> = {
          status: 'SYSTEM_STATUS',
          audit: 'DATA_STORE_AUDIT',
          history: 'VERSION_TIMELINE',
          signal: 'SIGNAL_ANALYSIS',
        };
        const command = action ? commandByAction[action] : undefined;
        if (!command || !agent) {
          addLog('Użycie: agent status|audit|history <cel> albo agent signal <cel> <ω> <t> <sygnał>. Nie są obsługiwane swobodne wiadomości.', 'error');
          break;
        }

        let payload: AgentProtocolRequest['payload'];
        if (command === 'SIGNAL_ANALYSIS') {
          const omega = Number(args[2]);
          const time = Number(args[3]);
          const signal = args.slice(4).join(' ').trim();
          if (args.length < 5 || !Number.isFinite(omega) || !Number.isFinite(time) || !signal) {
            addLog('Użycie: agent signal <cel> <ω> <t> <sygnał>. Parametry ω i t muszą być liczbami.', 'error');
            break;
          }
          payload = { signal, omega, time };
        } else if (args.length !== 2) {
          addLog(`Polecenie agent ${action} nie przyjmuje dodatkowego tekstu.`, 'error');
          break;
        }

        addLog(`Wysyłanie jawnego polecenia ${command} do ${agent}...`, 'system');
        try {
          await onSendProtocolRef.current({ command, agent, payload });
          addLog(`Polecenie ${command} zostało wykonane. Raport jest dostępny w historii komunikacji.`, 'success');
        } catch (e: any) {
          addLog(`Błąd polecenia protokołu: ${e.message}`, 'error');
        }
        break;
      }

      case 'root':
      case 'sudo':
      case 'exec':
      case 'sh':
      case 'infra':
      case 'alex':
      case 'sync':
      case 'set':
      case 'bump':
      case 'config':
      case 'history':
      case 'clear_chat': {
        const execute = onExecutePythonCommandRef.current;
        if (!execute) { addLog('Brak połączenia z terminalem serwera.', 'error'); break; }
        try {
          const result = await execute(rawCmd);
          addLog(result.output, 'output');
        } catch (error: any) { addLog(`Błąd terminala serwera: ${error.message}`, 'error'); }
        break;
      }

      default: {
        // Przywrócona konsola Binarnej Hiperprzestrzeni: każde polecenie → wektor 128-bit + NLP (OpenRouter) + komendy jądra
        addLog('[HYPEROS] Przetwarzanie w Binarnej Hiperprzestrzeni (128-bit) + NLP...', 'system');
        try {
          const res = await fetch('/api/hyperos/console', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: rawCmd }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || `HTTP ${res.status}`);
          }
          if (data.kernelOutput) {
            addLog(data.kernelOutput, 'output');
          }
          addLog(`[HYPEROS 128-bit] intencja: ${data.intent} · podobieństwo: ${(data.score * 100).toFixed(1)}% · NLP: ${data.nlpProvider}`, 'system');
          addLog(data.reply, 'success');
        } catch (e: any) {
          const pyCmd = onExecutePythonCommandRef.current;
          if (pyCmd) {
            try {
              const res = await pyCmd(rawCmd);
              addLog(res.output, 'output');
              break;
            } catch (err: any) {
              addLog(`Błąd wykonania polecenia jądra: ${err.message}`, 'error');
              break;
            }
          }
          addLog(`Błąd konsoli HyperOS: ${e.message}`, 'error');
        }
        break;
      }
    }
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }, []);

  return (
    <div dir="ltr" className="bastilla-terminal-shell flex-1 min-w-0 min-h-0 flex flex-col font-mono">
      <header className="bastilla-terminal-topbar">
        <div className="bastilla-terminal-window-dots" aria-hidden="true"><i /><i /><i /></div>
        <div className="bastilla-terminal-heading">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-cyan-300" />
            <h1>COMMAND CENTER <span className="text-cyan-300">/ BASTILLA</span></h1>
          </div>
          <p>Interaktywna konsola · rzeczywisty backend jądra SVL</p>
        </div>
        <div className="bastilla-terminal-top-actions">
          <span className={workspaceLive ? 'bastilla-terminal-live is-live' : 'bastilla-terminal-live'}>
            <Radio className="w-3.5 h-3.5" />
            {workspaceLive ? 'SYNCHRONIZACJA LIVE' : 'ODŚWIEŻANIE 4s'}
          </span>
          <button type="button" className="bastilla-terminal-icon-btn" onClick={() => setInspectorOpen((value) => !value)}
            title={inspectorOpen ? 'Ukryj panel aktywności' : 'Pokaż panel aktywności'}
            aria-label={inspectorOpen ? 'Ukryj panel aktywności' : 'Pokaż panel aktywności'}
            aria-pressed={inspectorOpen}>
            {inspectorOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <div className="bastilla-terminal-metrics" aria-label="Statystyki sesji terminala">
        <div><span className="metric-label">SESJA</span><strong><span className="bastilla-terminal-metric-dot" /> {running ? 'WYKONYWANIE' : 'GOTOWA'}</strong></div>
        <div><span className="metric-label">KOMENDY</span><strong>{history.length}</strong></div>
        <div><span className="metric-label">LOGI</span><strong>{logs.length}</strong></div>
        <div><span className="metric-label">ZMIANY LIVE</span><strong>{activity.length}</strong></div>
      </div>

      <nav className="flex shrink-0 gap-1.5 border-y border-cyan-900/60 bg-[#081827] px-3 py-2" aria-label="Widoki terminala">
        {([
          ['console','Konsola'],
          ['cards','Karta terminala'],
          ['monitoring','Wykresy i monitoring'],
        ] as const).map(([id,label]) => <button key={id} type="button" aria-pressed={advancedView===id}
          onClick={()=>setAdvancedView(id)} className={'shrink-0 rounded-lg border px-3 py-2 text-[11px] font-semibold transition ' +
            (advancedView===id ? 'border-cyan-500 bg-cyan-900/60 text-white' : 'border-slate-700 bg-slate-900 text-slate-300 hover:text-white')}>
          {label}
        </button>)}
      </nav>

      {advancedView==='cards' && <div className="min-h-0 flex-1 overflow-y-auto p-2.5 sm:p-4 space-y-3">
        <TerminalWorkCard title="BASTILLA / COMMAND CENTER · KARTA SESJI"
          command={history[history.length-1] || ''}
          status={running ? 'running' : logs.some(l=>l.type==='error') ? 'error' : history.length ? 'success' : 'idle'}
          source="Lokalna historia poleceń i wyników; backend SVL tylko dla obsługiwanych komend"
          entries={logs.map(l=>({type:l.type,text:l.content,time:l.timestamp} as TerminalCardEntry))}
          onCommandRequested={command=>void handleExecute(command)} />
        <p className="text-xs text-slate-400">W karcie pełnego terminala wykonanie wymaga dwóch kliknięć. Polecenia podlegają mechanizmom istniejącej konsoli i uprawnieniom serwera.</p>
      </div>}
      {advancedView==='monitoring' && <div className="min-h-0 flex-1 overflow-y-auto p-2.5 sm:p-4">
        <TerminalAnalyticsPanel />
      </div>}
      <div className="bastilla-terminal-body" style={{ display: advancedView==='console' ? undefined : 'none' }}>
        <section className="bastilla-terminal-console" aria-label="Konsola poleceń">
          <div className="bastilla-terminal-quickbar">
            <span className="bastilla-terminal-quicklabel"><Sparkles className="w-3.5 h-3.5" /> SZYBKIE AKCJE</span>
            <div className="bastilla-terminal-quicklist">
              {quickCmds.map((cmd, i) => (
                <div key={i} className="bastilla-terminal-quickchip">
                  <button type="button" disabled={running} onClick={() => void handleExecute(cmd)} title={'Wykonaj: ' + cmd}>{cmd}</button>
                  <button type="button" aria-label={'Usuń skrót ' + cmd} title="Usuń skrót" onClick={(event) => handleRemoveCmd(i, event)}><X className="w-3 h-3" /></button>
                </div>
              ))}
              {isAddingCmd ? (
                <div className="flex items-center gap-1">
                  <input type="text" value={newCmdText} onChange={(event) => setNewCmdText(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') handleAddCmd(); }}
                    placeholder="Nowy skrót" aria-label="Nowe szybkie polecenie" className="bastilla-terminal-quickinput" />
                  <button type="button" onClick={handleAddCmd} className="bastilla-terminal-action">Dodaj</button>
                  <button type="button" onClick={() => setIsAddingCmd(false)} aria-label="Anuluj dodawanie" className="bastilla-terminal-icon-btn"><X className="w-3 h-3" /></button>
                </div>
              ) : (
                <button type="button" onClick={() => setIsAddingCmd(true)} className="bastilla-terminal-addchip">+ skrót</button>
              )}
            </div>
          </div>

          <div className="bastilla-terminal-console-toolbar">
            <div className="bastilla-terminal-filters" role="group" aria-label="Filtr konsoli">
              <button type="button" aria-pressed={viewFilter === 'all'} onClick={() => setViewFilter('all')}>Wszystko</button>
              <button type="button" aria-pressed={viewFilter === 'sync'} onClick={() => setViewFilter('sync')}>System</button>
              <button type="button" aria-pressed={viewFilter === 'errors'} onClick={() => setViewFilter('errors')}>Błędy</button>
            </div>
            <div className="flex gap-1.5 items-center">
              <button type="button" className="bastilla-terminal-icon-btn" onClick={() => void copyLogs()} title="Kopiuj log tej sesji" aria-label="Kopiuj log sesji"><Copy className="w-4 h-4" /></button>
              <button type="button" className="bastilla-terminal-icon-btn" onClick={exportLogs} title="Pobierz lokalny log sesji" aria-label="Pobierz log sesji"><Download className="w-4 h-4" /></button>
              <button type="button" className="bastilla-terminal-icon-btn" onClick={() => setLogs([])} title="Wyczyść widok terminala" aria-label="Wyczyść widok terminala"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="bastilla-terminal-output" role="log" aria-label="Wyniki poleceń i zdarzenia synchronizacji" aria-live="polite">
            {filteredLogs.length ? filteredLogs.map((entry) => <LogEntryItem key={entry.id} entry={entry} />)
              : <div className="bastilla-terminal-placeholder">Brak wpisów dla wybranego filtra. Wybierz Wszystko albo wykonaj polecenie.</div>}
            {running && <div className="bastilla-terminal-processing" role="status"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Czekam na odpowiedź serwera…</div>}
            <div ref={terminalEndRef} />
          </div>
          {copyStatus && <div className="bastilla-terminal-copy-status" role="status">{copyStatus}</div>}
          <TerminalInputBar
            onExecute={handleExecute}
            history={history}
            antiMirrorActive={antiMirrorActive}
            onToggleAntiMirror={handleToggleAntiMirror}
            busy={running}
          />
        </section>

        {inspectorOpen && <aside className="bastilla-terminal-inspector" aria-label="Panel aktywności i synchronizacji">
          <div className="bastilla-terminal-inspector-title"><Activity className="w-4 h-4 text-cyan-300" /> AKTYWNOŚĆ SYSTEMU</div>
          <div className="bastilla-terminal-info-card">
            <div className="flex items-center justify-between"><span>Stan synchronizacji</span><span className={workspaceLive ? 'text-emerald-300' : 'text-amber-300'}>{workspaceLive ? 'LIVE' : 'POLLING'}</span></div>
            <p>{workspaceLive ? 'Zmiany czatu i terminala są przekazywane przez prywatny strumień zdarzeń SSE.' : 'Dane jądra odświeżają się co 4 sekundy. Zaloguj się jako operator w Menedżerze zadań, aby włączyć strumień między urządzeniami.'}</p>
          </div>
          <div className="bastilla-terminal-inspector-subtitle">OSTATNIE ZDARZENIA</div>
          <div className="bastilla-terminal-activity-list">
            {activity.length ? activity.slice(0, 8).map((item, i) => (
              <div key={item.at + '-' + i} className="bastilla-terminal-activity-row">
                <span className="bastilla-terminal-activity-dot" />
                <div><strong>{({ chat: 'Czat', terminal: 'Terminal', kernel: 'Jądro', agents: 'Agenci', workspace: 'Aplikacje' } as Record<string, string>)[item.topic] || 'System'}</strong>
                  <time dateTime={item.at}>{new Date(item.at).toLocaleTimeString('pl-PL')}</time>
                </div>
              </div>
            )) : <p className="bastilla-terminal-activity-empty">Brak nowych zdarzeń z backendu w tej sesji.</p>}
          </div>
          <div className="bastilla-terminal-info-card">
            <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-300" /> METADANE, NIE SEKRETY</div>
            <p>Między urządzeniami wysyłany jest wyłącznie sygnał zmiany. Wyniki poleceń pozostają w lokalnej sesji terminala. Pamięć czatu i DATA_STORE są pobierane z serwera.</p>
            {lastSyncAt && <small>Ostatni sygnał: {new Date(lastSyncAt).toLocaleTimeString('pl-PL')}</small>}
          </div>
        </aside>}
      </div>
      <footer className="bastilla-terminal-footer">
        <span><span className="bastilla-terminal-metric-dot" /> BASTILLA / KERNEL</span>
        <span>Historia klawiszami ↑ ↓ · Enter wykonuje · dotknij skrótu</span>
      </footer>
    </div>
  );
};
