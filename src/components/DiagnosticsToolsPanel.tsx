import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw, Wrench } from 'lucide-react';

type AgentName = 'Aria' | 'Alex' | 'Astyria' | 'Aurelius';
type Tool = { id: number; name: string; github: string; category: string; agent: AgentName; available: boolean | null; detection: string; binary: string | null };
type Inventory = { total: number; pathDetected: number; manuallyChecked: number; tools: Tool[]; note: string; scannedAt: string };
export function DiagnosticsToolsPanel({ agent, onPrepareMainChat }: {
  agent: AgentName; onPrepareMainChat: (text: string, agent: AgentName) => void;
}) {
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Wszystkie');
  const refresh = async () => {
    setBusy(true); setError('');
    try {
      const result = await fetch('/api/operations/diagnostics/tools', { credentials: 'same-origin', cache: 'no-store' });
      if (!result.ok) throw new Error(result.status === 401 ? 'Wymagane logowanie operatora.' : 'Brak odczytu katalogu.');
      const data = await result.json() as Inventory;
      if (!Array.isArray(data.tools)) throw new Error('Nieprawidłowa odpowiedź API.');
      setInventory(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Błąd pobierania.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { void refresh(); }, []);
  const categories = useMemo(() => ['Wszystkie', ...new Set((inventory?.tools || []).map(t => t.category))], [inventory]);
  const visible = useMemo(() => (inventory?.tools || []).filter(t =>
    (category === 'Wszystkie' || t.category === category) &&
    (t.name + ' ' + t.category + ' ' + t.agent).toLowerCase().includes(search.trim().toLowerCase())
  ), [inventory, search, category]);
  return <section className="bastilla-ops-panel space-y-4" aria-label="Katalog narzędzi diagnostycznych">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold text-slate-100">50 narzędzi diagnostycznych GitHub</h2>
        <p className="text-xs text-slate-400">Wykrywanie pliku w PATH nie oznacza sprawnego narzędzia. Żadnych automatycznych instalacji ani skanów.</p></div>
      <button type="button" onClick={() => void refresh()} disabled={busy} className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-100">
        <RefreshCw className="inline h-4 w-4 mr-1" /> {busy ? 'Sprawdzam…' : 'Sprawdź dostępność'}
      </button>
    </div>
    {error && <p role="alert" className="text-rose-300 text-xs">{error}</p>}
    {inventory && <p className="text-xs text-cyan-200">Katalog: {inventory.total} · wykryte w PATH: {inventory.pathDetected} · usługi/narzędzia ręczne: {inventory.manuallyChecked}</p>}
    <div className="flex flex-wrap gap-2">
      <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Szukaj narzędzia…" aria-label="Szukaj narzędzia"
        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white" />
      <select value={category} onChange={e => setCategory(e.target.value)} aria-label="Kategoria"
        className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white">{categories.map(c => <option key={c}>{c}</option>)}</select>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
      {visible.map(tool => <div key={tool.id} className="rounded-lg border border-slate-700 bg-slate-900 p-3 space-y-2">
        <div className="flex justify-between gap-2 items-center">
          <strong className="text-sm text-slate-100">{tool.id}. {tool.name}</strong>
          <span className={tool.available === true ? 'text-emerald-300 text-xs' : 'text-amber-300 text-xs'}>
            {tool.available === true ? 'W PATH' : tool.available === null ? 'Sprawdź ręcznie' : 'Brak w PATH'}
          </span>
        </div>
        <div className="text-xs text-slate-400">{tool.category} · specjalizacja: {tool.agent} · polecenie: {tool.binary || 'usługa / ręczne'}</div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <a href={tool.github} rel="noopener noreferrer" target="_blank" className="text-cyan-300 underline inline-flex gap-1 items-center">
            <ExternalLink className="h-3 w-3" /> GitHub</a>
          <button type="button" className="rounded-lg border border-slate-600 px-2 py-1 text-slate-200"
            onClick={() => onPrepareMainChat(
              'Sprawdź możliwość wykorzystania narzędzia ' + tool.name + ' (' + tool.github + ') w diagnostyce Bastilla. Dostępność w PATH: ' +
              (tool.available === true ? 'wykryte' : 'niepotwierdzona') +
              '. Najpierw sprawdź warunki instalacji, uprawnienia i bezpieczeństwo. Nie instaluj, nie skanuj cudzych zasobów i nie zmieniaj konfiguracji bez zgody. Pokaż realne wyniki.', agent)}>
            <Wrench className="inline h-3 w-3 mr-1" /> Zleć {agent}
          </button>
        </div>
      </div>)}
    </div>
  </section>;
}
