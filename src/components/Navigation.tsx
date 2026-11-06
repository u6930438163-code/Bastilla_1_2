import React from 'react';
import { Terminal, MessagesSquare } from 'lucide-react';

export type TabId =
  | 'home'
  | 'bastilla_os_2'
  | 'comms'
  | 'approvals'
  | 'process_matrix'
  | 'astyria_mission'
  | 'schema_graph'
  | 'temporal'
  | 'terminal'
  | 'monolith'
  | 'datastore'
  | 'diagnostics'
  | 'visualizer'
  | 'file_explorer'
  | 'apps'
  | 'hyper_com'
  | 'without_nlp'
  | 'github'
  | 'gpt_actions'
  | 'cloud_library'
  | 'integrations'
  | 'librechat'
  | 'project_progress'
  | 'intimate_chat'
  | 'bastilla_5';

export const TAB_IDS: readonly TabId[] = ['comms', 'terminal'];

/** Widok startowy — dostępny wyłącznie Czat oraz Terminal. */
export function initialTabFromLocation(): TabId {
  try {
    const view = new URLSearchParams(window.location.search).get('view');
    return view === 'terminal' ? 'terminal' : 'comms';
  } catch {
    return 'comms';
  }
}

interface NavigationProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  messageCount: number;
  versionCount: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onSelectTab,
  messageCount,
}) => {
  const tabs = [
    {
      id: 'comms' as TabId,
      label: 'Czat',
      icon: MessagesSquare,
      badge: `${messageCount}`,
    },
    {
      id: 'terminal' as TabId,
      label: 'Terminal',
      icon: Terminal,
      badge: 'CLI',
    },
  ];

  return (
    <nav aria-label="Nawigacja" className="app-navigation order-last flex w-full shrink-0 flex-row border-t border-blue-200/10 bg-[#07101e] lg:order-first lg:h-auto lg:w-56 lg:flex-col lg:border-r lg:border-t-0">
      <div className="flex min-h-0 min-w-0 flex-1 flex-row gap-2 p-2 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:p-3">
        <div className="hidden px-3 pb-2 pt-1 text-[9px] font-mono font-bold tracking-[0.18em] text-cyan-200/70 lg:block">
          MODUŁY SYSTEMU
        </div>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              title={tab.label}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelectTab(tab.id)}
              className={`group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-center transition-all duration-200 lg:min-h-11 lg:w-full lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-left ${
                isActive
                  ? 'border border-cyan-300/25 bg-cyan-950/60 text-cyan-100 shadow-[inset_2px_0_0_#67e8f9,0_4px_18px_rgba(8,145,178,0.12)]'
                  : 'border border-transparent text-slate-400 hover:bg-blue-950/50 hover:text-blue-100'
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 transition ${isActive ? 'text-cyan-200' : 'text-slate-500 group-hover:text-cyan-200'}`} />
              <span className="w-full truncate text-[11px] font-medium lg:hidden">{tab.label}</span>
              <span className="hidden min-w-0 flex-1 truncate text-xs font-medium lg:block">{tab.label}</span>
              <span className={`hidden rounded-md px-1.5 py-0.5 text-[9px] font-mono font-bold xl:block ${isActive ? 'bg-cyan-900/70 text-cyan-200' : 'bg-slate-900 text-slate-500'}`}>
                {tab.badge}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

