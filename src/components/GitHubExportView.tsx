import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Github, RefreshCw, ShieldCheck, UploadCloud, Users, Sparkles, Terminal, Rocket, Check, GitBranch } from 'lucide-react';

interface GitStatus {
  branch: string;
  repositoryUrl: string | null;
  ahead: number;
  behind: number;
  dirtyFiles: number;
  autoSync: boolean;
  githubPermissions?: string;
  adminStatus?: string;
}

interface AgentAdminInfo {
  name: string;
  role: string;
  title: string;
  scopes: string[];
  description: string;
  badgeColor: string;
}

const AGENTS_LIST: AgentAdminInfo[] = [
  {
    name: 'Alex',
    role: 'Administrator Architektury i Repozytorium',
    title: 'Lead & Architect Admin',
    scopes: ['repo', 'workflow', 'pull-requests: write', 'branches', 'merges'],
    description: 'Koordynacja zmian w backendzie, scalanie gałęzi i release architektury.',
    badgeColor: 'border-emerald-600/40 bg-emerald-950/40 text-emerald-300',
  },
  {
    name: 'Aurelius',
    role: 'Administrator Bezpieczeństwa i CI/CD',
    title: 'Security & Compliance Admin',
    scopes: ['security-events: write', 'audit', 'branch-protection', 'workflows'],
    description: 'Nadzór nad zaporą, integralnością kodu, testami i brakiem wycieku sekretów.',
    badgeColor: 'border-cyan-600/40 bg-cyan-950/40 text-cyan-300',
  },
  {
    name: 'Aria',
    role: 'Administratorka Integracji i AI Services',
    title: 'Integrations & AI Transport Admin',
    scopes: ['integrations', 'webhooks', 'packages: write', 'models-mcp'],
    description: 'Zarządzanie połączeniami API modeli, webhookami i integracjami zewnętrznymi.',
    badgeColor: 'border-purple-600/40 bg-purple-950/40 text-purple-300',
  },
  {
    name: 'Astyria',
    role: 'Administratorka Interfejsu i Wydań GUI',
    title: 'Frontend & UX Release Admin',
    scopes: ['ui-assets', 'releases', 'gui-sync', 'pages', 'mobile-ux'],
    description: 'Nadzór nad interfejsem graficznym, responsywnością mobilną i wydaniami webowymi.',
    badgeColor: 'border-amber-600/40 bg-amber-950/40 text-amber-300',
  },
];

const TARGET_REPOSITORIES = [
  {
    name: 'mmitek515-netizen/Bastilla_OS_2',
    role: 'Główny system operacyjny',
    scope: 'Pulpit webowy, API, czat Triady, terminal, CI/CD, 100/100 testów',
    status: 'AKTYWNY',
  },
  {
    name: 'u6930438163-code/AI_Studio_BastillaOS',
    role: 'Baza źródeł i wydanie AI Studio',
    scope: 'Synchronizacja dwukierunkowa kodu z Google AI Studio',
    status: 'POŁĄCZONE',
  },
  {
    name: 'mmitek515-netizen/aplikacje (apps/*)',
    role: 'Moduły użytkowe i narzędzia',
    scope: 'Wdrożenie artefaktów z exports/ do apps/ i rejestracja GUI',
    status: 'WDROŻONE',
  },
  {
    name: 'Nowy_system & svl_kernel.py',
    role: 'Jądro SVL & VM_Ten_System',
    scope: 'Pętla samoleczenia, telemetria RAM <70%, snapshoty jądra',
    status: 'ZSYNCHRONIZOWANE',
  },
  {
    name: 'bastillaos (v1)',
    role: 'Kompatybilność wsteczna',
    scope: 'Zachowanie zgodności API i pakietów debianowych',
    status: 'STABILNE',
  },
];

export const GitHubExportView: React.FC = () => {
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string>('triad');
  const [commitMessage, setCommitMessage] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const refreshStatus = useCallback(async () => {
    const response = await fetch('/api/triad/git/status');
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || `Nie można pobrać stanu Git (HTTP ${response.status}).`);
    }
    setGitStatus(data);
  }, []);

  useEffect(() => {
    void refreshStatus().catch((error: unknown) => {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : String(error));
    });
  }, [refreshStatus]);

  const handleLaunchMission = async () => {
    if (loading) return;
    setLoading(true);
    setStatus('idle');
    setMessage('Uruchamiam misję nadrzędną dokończenia projektów we wszystkich repozytoriach GitHub...');
    try {
      const response = await fetch('/api/astyria/mission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finish_all_github_projects' }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || `Błąd uruchamiania misji (HTTP ${response.status}).`);
      }
      setStatus('success');
      setMessage(data.reply || 'Misja dokończenia projektów we wszystkich repozytoriach GitHub została oficjalnie aktywowana!');
      await refreshStatus();
    } catch (error: unknown) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (loading) return;
    setLoading(true);
    setStatus('idle');
    setMessage('Sprawdzam zmiany aplikacji, zapisuję commit i wysyłam do origin...');
    try {
      const response = await fetch('/api/triad/github/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: selectedAgent,
          message: commitMessage.trim() || `Synchronizacja kodu aplikacji z GitHub (${selectedAgent === 'triad' ? 'Triada' : selectedAgent})`,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || `Synchronizacja nie powiodła się (HTTP ${response.status}).`);
      }
      setStatus('success');
      setMessage(data.sha
        ? `Zapisano commit ${data.sha} (autor: ${selectedAgent}) i wysłano do origin/${data.branch}.`
        : `Brak nowych zmian do commita; origin/${data.branch} jest zsynchronizowane.`);
      await refreshStatus();
    } catch (error: unknown) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 p-4 font-mono md:p-6">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        {/* Nagłówek i status */}
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="rounded-xl border border-slate-700 bg-slate-800 p-3 text-white">
                <Github className="h-8 w-8" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-100">
                    GitHub & Agenci AI
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-950 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    <ShieldCheck className="h-3 w-3" /> FULL ADMIN
                  </span>
                  <span className="rounded border border-cyan-800 bg-cyan-950 px-2 py-0.5 text-[10px] uppercase text-cyan-400">
                    {gitStatus?.autoSync ? 'AUTO SYNC' : 'MANUAL'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  Główne repozytorium: <span className="text-cyan-300 font-semibold">mmitek515-netizen/Bastilla_OS_2</span>
                </p>
              </div>
            </div>
            {gitStatus?.repositoryUrl && (
              <a
                href={gitStatus.repositoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-slate-800 px-3 py-2 text-xs font-bold text-emerald-400 transition-colors hover:bg-slate-700"
              >
                Otwórz repozytorium <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </section>

        {/* Nadrzędna Misja Dokończenia Repozytoriów */}
        <section className="rounded-xl border border-gradient-to-r border-cyan-500/50 bg-gradient-to-br from-slate-900 via-slate-900/90 to-cyan-950/40 p-5 shadow-2xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg border border-cyan-500/40 bg-cyan-950/60 p-2 text-cyan-400">
                <Rocket className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                  Misja: Dokończenie projektów we wszystkich repozytoriach
                </h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-bold text-cyan-300 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                    DYREKTYWA: COMPLETE_ALL_GITHUB_REPOSITORIES_PROJECTS
                  </span>
                  <span className="text-[10px] text-emerald-400 font-semibold">AUTORYZACJA: WYDANA</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleLaunchMission()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-900/30 transition-all hover:from-emerald-500 hover:to-teal-500 active:scale-95 disabled:opacity-50"
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {loading ? 'URUCHAMIANIE...' : 'URUCHOM MISJĘ WE WSZYSTKICH REPO'}
            </button>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Projekty i repozytoria objęte misją dokończenia:
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {TARGET_REPOSITORIES.map((repo) => (
                <div key={repo.name} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">{repo.name}</span>
                    <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-1.5 py-0.2 rounded">
                      {repo.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-cyan-300 font-medium">{repo.role}</div>
                  <div className="text-[10px] text-slate-400 leading-tight">{repo.scope}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Panel Uprawnień Administracyjnych Agentów */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-slate-200">
              <Users className="h-5 w-5 text-cyan-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider">
                Uprawnienia Administracyjne Agentów AI
              </h3>
            </div>
            <span className="text-[11px] text-emerald-400 font-semibold bg-emerald-950/60 border border-emerald-800 px-2.5 py-0.5 rounded-full">
              Autoryzacja właściciela: AKTYWNA
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {AGENTS_LIST.map((agent) => (
              <div
                key={agent.name}
                className={`rounded-lg border p-3.5 space-y-2 transition-all ${
                  selectedAgent === agent.name
                    ? 'border-cyan-500 bg-cyan-950/20 shadow-md ring-1 ring-cyan-500'
                    : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-100">{agent.name}</span>
                      <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${agent.badgeColor}`}>
                        ADMIN
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-medium">{agent.role}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedAgent(agent.name)}
                    className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                      selectedAgent === agent.name
                        ? 'border-cyan-400 bg-cyan-500 text-slate-950 font-bold'
                        : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {selectedAgent === agent.name ? 'WYBRANY' : 'UŻYJ'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">{agent.description}</p>
                <div className="flex flex-wrap gap-1 pt-1">
                  {agent.scopes.map((s) => (
                    <span key={s} className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-cyan-300">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
            <span className="text-slate-400">Wykonawca operacji:</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedAgent('triad')}
                className={`px-3 py-1 rounded text-xs border transition-colors ${
                  selectedAgent === 'triad'
                    ? 'border-cyan-400 bg-cyan-500 text-slate-950 font-bold'
                    : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Cała Triada (Zbiorczo)
              </button>
            </div>
          </div>
        </section>

        {/* Stan synchronizacji i wywołanie */}
        <section className="space-y-4 rounded-xl border border-cyan-900/50 bg-cyan-950/20 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-cyan-300">
              Stan lokalnego repozytorium
            </h3>
            <span className="text-[11px] text-slate-400">
              Autor commita: <strong className="text-cyan-300">{selectedAgent}</strong>
            </span>
          </div>

          {gitStatus ? (
            <dl className="grid grid-cols-2 gap-3 text-xs text-slate-300 md:grid-cols-4">
              <div className="rounded border border-slate-800 bg-slate-900/60 p-2.5">
                <dt className="text-slate-500 text-[11px]">Bieżąca gałąź</dt>
                <dd className="mt-1 font-bold text-cyan-400">{gitStatus.branch}</dd>
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/60 p-2.5">
                <dt className="text-slate-500 text-[11px]">Zmodyfikowane pliki</dt>
                <dd className="mt-1 font-bold">{gitStatus.dirtyFiles} plików</dd>
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/60 p-2.5">
                <dt className="text-slate-500 text-[11px]">Do wysłania (ahead)</dt>
                <dd className="mt-1 font-bold text-emerald-400">{gitStatus.ahead} commitów</dd>
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/60 p-2.5">
                <dt className="text-slate-500 text-[11px]">Do pobrania (behind)</dt>
                <dd className="mt-1 font-bold">{gitStatus.behind} commitów</dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-slate-400">Odczytuję status repozytorium...</p>
          )}

          <div className="space-y-2">
            <label htmlFor="commitMsg" className="block text-[11px] text-slate-400">
              Opcjonalny opis commita (lub domyślny z autorstwem {selectedAgent}):
            </label>
            <input
              id="commitMsg"
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder={`np. feat(admin): synchronizacja zmian repozytorium przez ${selectedAgent}`}
              className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <p className="text-[11px] leading-relaxed text-slate-400">
            Operacja uruchamia weryfikację kodu (`npm run verify`), tworzy podpisany commit z autorstwem wybranego agenta i bezpiecznie wysyła zmiany do gałęzi origin/{gitStatus?.branch || 'main'}.
          </p>

          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-900/20 transition-all hover:bg-cyan-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <RefreshCw className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}
            {loading ? 'SYNCHRONIZUJĘ...' : `SYNCHRONIZUJ TERAZ JAKO ${selectedAgent.toUpperCase()}`}
          </button>
        </section>

        {status !== 'idle' && (
          <div
            role="status"
            className={`flex items-start gap-3 rounded-xl border p-4 ${
              status === 'success'
                ? 'border-emerald-800 bg-emerald-950/30 text-emerald-400'
                : 'border-red-800 bg-red-950/30 text-red-400'
            }`}
          >
            {status === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
            <p className="text-xs leading-relaxed whitespace-pre-line">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
};

