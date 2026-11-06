import React from 'react';
import { Shield, Sparkles, ExternalLink, Activity } from 'lucide-react';
import { DataStore } from '../kernel/svlKernel';

interface Bastilla5ViewProps {
  dataStore?: DataStore;
}

export const Bastilla5View: React.FC<Bastilla5ViewProps> = ({ dataStore }) => {
  return (
    <div className="flex flex-col min-h-0 flex-1 bg-[#050b18] text-slate-100 overflow-hidden">
      <header className="border-b border-amber-500/25 bg-[#0d1628] px-6 py-4 flex items-center justify-between shrink-0 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 via-amber-600 to-amber-800 flex items-center justify-center text-white font-black text-lg shadow-md ring-2 ring-amber-500/30">
            B5
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight text-white">BASTILLA 5 — UNIFIED SUPER-APP</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-500/40">
                ALL MODULES ACTIVE (OS 2 + INTIMATE CHAT + OLLAMA)
              </span>
            </div>
            <p className="text-xs text-slate-400">Wszystkie włączone moduły, agent swarm, intymny czat i Ollama dolphin-mixtral:8x7b zintegrowane w Bastilla 5.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/api/apps/preview/bastilla_5/"
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Otwórz Bastilla 5 na pełnym ekranie</span>
          </a>
        </div>
      </header>

      <div className="flex-1 min-h-0 relative bg-black">
        <iframe
          src="/api/apps/preview/bastilla_5/"
          title="Bastilla 5 Unified Runtime"
          className="w-full h-full border-0"
        />
      </div>
    </div>
  );
};
