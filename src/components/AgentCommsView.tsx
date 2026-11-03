import React, { useEffect, useRef, useState } from 'react';
import { DataStore, OPERATOR_NAME } from '../kernel/svlKernel';
import { SYSTEM_AGENTS, AgentProfile } from '../kernel/agents';
import { Sparkles, ShieldCheck, RefreshCw, Image as ImageIcon, FileText, MessagesSquare, Paperclip, Send, X, SlidersHorizontal, Maximize2, Minimize2 } from 'lucide-react';
import { FormattedMessage } from './FormattedMessage';
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
  readChatAttachmentFile,
  validateChatAttachments,
} from '../kernel/chatAttachments';

interface AgentCommsViewProps {
  dataStore: DataStore;
  onSendProtocol: (request: AgentProtocolRequest) => Promise<AgentProtocolReply | undefined>;
  onSendMessage: (
    message: string,
    agent: 'triad' | 'Alex' | 'Astyria' | 'Aurelius' | 'si_1',
    attachments?: ChatAttachment[],
  ) => Promise<void>;
  onRunAstyriaMission: (action: AstyriaMissionAction) => Promise<void>;
  isLoading: boolean;
  sendError?: string | null;
  onClearHistory: () => void;
  onForceSync?: () => void;
  onTriggerInitiative?: () => Promise<void>;
  onUnclog?: () => void;
  onRestoreBackup?: () => void;
}

export const AgentCommsView: React.FC<AgentCommsViewProps> = ({
  dataStore,
  onSendProtocol,
  onSendMessage,
  onRunAstyriaMission,
  isLoading,
  sendError,
  onClearHistory,
  onForceSync,
}) => {
  const [selectedTarget, setSelectedTarget] = useState<'triad' | 'Alex' | 'Astyria' | 'Aurelius' | 'si_1'>('triad');
  const [selectedCommand, setSelectedCommand] = useState<AgentProtocolCommand>('SYSTEM_STATUS');
  const [signal, setSignal] = useState('');
  const [omega, setOmega] = useState('');
  const [time, setTime] = useState('');
  const [selectedMissionAction, setSelectedMissionAction] = useState<AstyriaMissionAction>('deep_scan');
  const [messageText, setMessageText] = useState('');
  const [chatAttachments, setChatAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [showProtocolTools, setShowProtocolTools] = useState(false);
  const [isFullViewport, setIsFullViewport] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const followLatestMessagesRef = useRef(true);
  const transmissionStatus = sendError
    ? { label: 'BŁĄD', color: 'rose' }
    : isLoading
    ? { label: 'AKTYWNY', color: 'cyan' }
    : { label: 'GOTOWY', color: 'emerald' };

  useEffect(() => {
    const chatScroll = chatScrollRef.current;
    if (chatScroll && followLatestMessagesRef.current) {
      chatScroll.scrollTop = chatScroll.scrollHeight;
    }
  }, [dataStore.chat_history.length, isLoading]);

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
    try {
      await onSendMessage(message, selectedTarget, chatAttachments);
      setMessageText('');
      setChatAttachments([]);
      setAttachmentError(null);
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
      <div className="bg-slate-900/95 backdrop-blur-md border-b border-cyan-500/30 px-2.5 sm:px-4 py-1.5 flex items-center justify-between gap-2 shadow-sm shrink-0">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            title={`Status: ${transmissionStatus.label}`}
            className={`w-2.5 h-2.5 shrink-0 rounded-full ${
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
            className="min-w-0 flex-1 max-w-xs rounded-lg border border-cyan-500/40 bg-slate-950 px-2.5 py-1 text-xs font-semibold text-cyan-100 outline-none transition focus:border-cyan-400 disabled:opacity-50"
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

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            aria-expanded={showProtocolTools}
            onClick={() => setShowProtocolTools(!showProtocolTools)}
            className={`px-2 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer ${
              showProtocolTools
                ? 'bg-cyan-950 border-cyan-400 text-cyan-200'
                : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-cyan-500/50'
            }`}
            title="Pokaż lub ukryj narzędzia protokołu i misji"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Narzędzia</span>
          </button>

          {onForceSync && (
            <button
              type="button"
              onClick={onForceSync}
              disabled={isLoading}
              className="px-2 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
              title="Synchronizuj stan czatu"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClearHistory}
            className="px-2 py-1 bg-rose-950/80 hover:bg-rose-900 border border-rose-600/60 text-rose-200 rounded-lg cursor-pointer transition font-bold text-[11px] flex items-center gap-1"
            title="Wyczyść historię czatu"
          >
            <X className="w-3.5 h-3.5 text-rose-300" />
            <span className="hidden sm:inline">Wyczyść</span>
          </button>

          <button
            type="button"
            onClick={() => setIsFullViewport(!isFullViewport)}
            className="px-2 py-1 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-200 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
            title={isFullViewport ? 'Pokaż dolny pasek nawigacji' : 'Pełny ekran na całą stronę'}
            aria-label={isFullViewport ? 'Zamknij pełny ekran' : 'Pełny ekran na całą stronę'}
          >
            {isFullViewport ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="hidden xs:inline">{isFullViewport ? 'Pasek' : 'Pełny ekran'}</span>
          </button>
        </div>
      </div>

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
        {sendError && (
          <div role="alert" aria-live="assertive" className="rounded-lg border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-200">
            Nie udało się wysłać żądania: {sendError}
          </div>
        )}
        {dataStore.chat_history.length === 0 ? (
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
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[11px] tracking-wide ${
                      isOperator
                        ? 'bg-purple-900/85 text-purple-200 border border-purple-500/60'
                        : profile
                        ? profile.badgeBg
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {msg.agent}
                  </span>

                  <span className="text-[10px] text-slate-500 font-mono">
                    #{String(idx + 1).padStart(3, '0')}
                  </span>
                </div>

                {/* Message Body with KaTeX LaTeX formulas and Markdown */}
                <FormattedMessage content={msg.tekst} className="text-xs sm:text-sm leading-relaxed text-slate-100" />

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
                          alt={msg.file.name}
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

        {isLoading && (
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

      {/* Compact Single-Row Message Input Box */}
      <form onSubmit={handleSendMessage} className="relative w-full shrink-0 border-t border-cyan-500/30 bg-slate-950 px-2.5 py-2 sm:px-4 sm:py-2.5 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto space-y-1.5">
          {chatAttachments.length > 0 && (
            <ul aria-label="Załączone pliki" className="flex flex-wrap gap-1.5">
              {chatAttachments.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-950/60 px-2 py-0.5 text-[11px] text-cyan-100">
                  <FileText className="h-3 w-3 text-cyan-400" />
                  <span>{file.name}</span>
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
          {attachmentError && <p role="alert" className="text-[11px] text-rose-300 font-semibold">{attachmentError}</p>}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="relative flex min-w-0 flex-1 items-center">
              <textarea
                id="triad-chat-message"
                aria-label="Wiadomość do czatu without_nlp"
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                maxLength={20_500}
                rows={1}
                disabled={isLoading}
                placeholder="Wiadomość do agentów…"
                className="w-full resize-none rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-2 pr-8 font-mono text-xs sm:text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 disabled:opacity-50 min-h-[38px] max-h-28"
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
              title="Dołącz pliki: tekst 5 MB/plik, DOCX 20 MB, PDF/JPG 20 MB/plik (maks. 10 plików)"
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
            <button
              type="submit"
              aria-label="Wyślij wiadomość do agentów"
              disabled={(!messageText.trim() && chatAttachments.length === 0) || isLoading}
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

