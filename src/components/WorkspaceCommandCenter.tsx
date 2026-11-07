import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, BarChart3, BrainCircuit, CheckSquare, ChevronDown, ChevronUp, ClipboardList,
  Code2, Copy, Cpu, FileText, Image as ImageIcon, LayoutGrid, ListChecks, MessageSquare,
  PlayCircle, RefreshCw, Search, Server, Sparkles, TerminalSquare, Video, Wrench, Workflow,
} from 'lucide-react';

type Stream = {
  prompt: string;
  agents: Array<{ agent: string; text: string; status: 'writing' | 'done' | 'error' }>;
} | null;

type Category = 'Wszystkie' | 'Wizualizacje' | 'Kod i terminal' | 'Agenci i system' | 'Pliki i media';
type Tool = {
  title: string;
  category: Exclude<Category, 'Wszystkie'>;
  description: string;
  prompt: string;
  icon: React.ComponentType<{ className?: string }>;
};
const categories: Category[] = ['Wszystkie', 'Wizualizacje', 'Kod i terminal', 'Agenci i system', 'Pliki i media'];
const tools: Tool[] = [
  { title: 'Wykres', category: 'Wizualizacje', icon: BarChart3, description: 'Liniowy lub słupkowy z danych',
    prompt: 'Przeanalizuj dostępne prawdziwe pomiary, zwróć bastilla-ui z blokiem chart (labels, values, unit, caption). Gdy brak pomiarów, wyjaśnij to; nie twórz fikcyjnych danych.' },
  { title: 'Metryki', category: 'Wizualizacje', icon: Activity, description: 'Karty KPI i bieżących wartości',
    prompt: 'Pokaż potwierdzone metryki systemowe jako karty bastilla-ui type metric, podaj źródła i czas pomiaru. Nie zgaduj CPU, RAM ani procentów.' },
  { title: 'Tabela', category: 'Wizualizacje', icon: LayoutGrid, description: 'Filtrowalne zestawienie',
    prompt: 'Odpowiedz w formie czytelnej tabeli bastilla-ui type table z rzeczywistymi danymi i wskazaniem źródła.' },
  { title: 'Postęp', category: 'Wizualizacje', icon: Workflow, description: 'Etapy i paski zadań',
    prompt: 'Pokaż stan zadania jako bastilla-ui type steps lub progress. Nie podawaj procentu, jeśli backend go nie dostarcza; pokaż etapy oczekujące.' },
  { title: 'Oś czasu', category: 'Wizualizacje', icon: ClipboardList, description: 'Kolejne zdarzenia i etapy',
    prompt: 'Przedstaw potwierdzone zdarzenia jako bastilla-ui type timeline ze stanami done/running/error/pending.' },
  { title: 'Zakładki', category: 'Wizualizacje', icon: LayoutGrid, description: 'Wiele widoków w jednej karcie',
    prompt: 'Odpowiedz z blokiem bastilla-ui type tabs: zakładki status, szczegóły i działania, z bezpiecznymi danymi.' },
  { title: 'Rozwijane sekcje', category: 'Wizualizacje', icon: ChevronDown, description: 'Akordeon dla długich raportów',
    prompt: 'Przedstaw raport jako bastilla-ui type accordion z sekcjami opisującymi rzeczywiste wyniki.' },
  { title: 'Formularz', category: 'Wizualizacje', icon: ListChecks, description: 'Interaktywny zbiór parametrów',
    prompt: 'Zaproponuj bastilla-ui type form z polami, etykietami i jawnie potwierdzanym wysłaniem promptu. Nie uruchamiaj kodu z formularza.' },
  { title: 'Lista kontrolna', category: 'Wizualizacje', icon: CheckSquare, description: 'Zaznaczane kroki naprawy',
    prompt: 'Przedstaw bezpieczną checklistę bastilla-ui type checklist do ręcznej akceptacji kroków przez operatora.' },
  { title: 'Kod', category: 'Kod i terminal', icon: Code2, description: 'Kolorowana składnia i kopiowanie',
    prompt: 'Przygotuj prawidłowy kod w bloku Markdown, wyjaśnij pliki i testy. Nie wykonuj go bez mojej zgody.' },
  { title: 'cURL / HTTP', category: 'Kod i terminal', icon: Server, description: 'Nagłówki, status, JSON',
    prompt: 'Pokaż techniczną kartę bastilla-ui type curl i http z metodą, adresem, nagłówkami, body oraz wynikiem, jeśli potwierdzony. Żadnych tokenów i fikcyjnych wyników.' },
  { title: 'JSON', category: 'Kod i terminal', icon: Code2, description: 'Ustrukturyzowany podgląd danych',
    prompt: 'Przedstaw dane w bastilla-ui type json z czytelnym formatowaniem, zweryfikuj składnię.' },
  { title: 'Różnice kodu', category: 'Kod i terminal', icon: Code2, description: 'Diff zmian i poprawek',
    prompt: 'Pokaż bezpieczny diff plików w bastilla-ui type diff. Nie deklaruj commita ani wdrożenia bez dowodu.' },
  { title: 'Logi', category: 'Kod i terminal', icon: TerminalSquare, description: 'Sukcesy i błędy osobno',
    prompt: 'Pokaż potwierdzone logi jako bastilla-ui type logs, oddziel success/warning/error i podaj źródło.' },
  { title: 'Karta terminala', category: 'Kod i terminal', icon: TerminalSquare, description: 'Panel konsoli w rozmowie',
    prompt: 'Pokaż bastilla-ui type terminal z realnymi wpisami i statusem. Nie symuluj wykonania; polecenia wymagają potwierdzenia.' },
  { title: 'Status agentów', category: 'Agenci i system', icon: MessageSquare, description: 'Aria, Alex, Astyria, Aurelius',
    prompt: 'Sprawdź prawdziwy stan moich czterech oryginalnych agentów AI: Aria, Alex, Astyria, Aurelius. Podaj tylko potwierdzone statusy połączeń i ostatnie odpowiedzi.' },
  { title: 'Zadania', category: 'Agenci i system', icon: ClipboardList, description: 'Przydziały i wykonanie',
    prompt: 'Pokaż zadania agentów w bastilla-ui jako timeline, table i actions. Uwzględnij właściciela, rzeczywisty stan i logi.' },
  { title: 'Diagnoza błędów', category: 'Agenci i system', icon: Wrench, description: 'Naprawa przez wskazanego agenta',
    prompt: 'Zdiagnozuj błędy z realnych logów i przedstaw propozycje naprawy w bastilla-ui type handoff i actions. Nie wykonuj zmian bez mojej akceptacji.' },
  { title: 'Ollama', category: 'Agenci i system', icon: Cpu, description: 'RAM, model, fallback, serwer',
    prompt: 'Zdiagnozuj Ollama na podstawie prawdziwych endpointów i logów: serwer, model aktywny, modele załadowane do RAM i fallback. Jeśli API niedostępne, oznacz brak weryfikacji.' },
  { title: 'MCP', category: 'Agenci i system', icon: BrainCircuit, description: 'Narzędzia i stan bramy',
    prompt: 'Sprawdź bramę MCP za pomocą rzeczywistego initialize i tools/list; pokaż wynik i błędy. Nie zakładaj aktywnego połączenia bez testu.' },
  { title: 'Synchronizacja', category: 'Agenci i system', icon: RefreshCw, description: 'Stan czatu, jądra i terminala',
    prompt: 'Sprawdź synchronizację czatu, terminala, agentów i jądra przez istniejące API; pokaż potwierdzone zmiany i rozbieżności.' },
  { title: 'Raport', category: 'Agenci i system', icon: FileText, description: 'Sukcesy, błędy, wyniki',
    prompt: 'Przygotuj raport operacyjny na bazie realnych danych w bastilla-ui jako metryki, tabela, alerty i działania do zatwierdzenia.' },
  { title: 'Grafika', category: 'Pliki i media', icon: ImageIcon, description: 'Obraz w odpowiedzi agenta',
    prompt: 'Znajdź lub wygeneruj obraz i pokaż jako bastilla-ui type image ze sprawdzonym src HTTPS lub zasobem lokalnym. Jeśli nie możesz, wskaż ograniczenie.' },
  { title: 'Wideo', category: 'Pliki i media', icon: Video, description: 'Odtwarzacz w wiadomości',
    prompt: 'Podaj prawdziwy adres filmu HTTPS/YouTube do osadzenia w bastilla-ui type video. Nie generuj fikcyjnego wideo ani linku.' },
  { title: 'PDF / pliki', category: 'Pliki i media', icon: FileText, description: 'Załączniki, podgląd, analiza',
    prompt: 'Przygotuj podgląd lub analizę rzeczywiście dołączonych plików PDF, DOCX lub zdjęć. Jeśli pliku nie ma, poproś o dołączenie go w czacie.' },
  { title: '3D', category: 'Pliki i media', icon: PlayCircle, description: 'Wizualizacja przestrzenna',
    prompt: 'Jeśli mamy dane geometrii, utwórz bastilla-ui type diagram3d lub opis bezpiecznej interaktywnej wizualizacji. Nie wymyślaj danych przestrzennych.' },
];

type Props = {
  history: Array<{ agent: string; tekst: string }>;
  streamingChat?: Stream;
  isLoading: boolean;
  onPreparePrompt: (prompt: string) => void;
  onToggleTerminal: () => void;
  onOpenTerminal?: () => void;
  onSync?: () => void;
};

const agentNames = ['Aria', 'Alex', 'Astyria', 'Aurelius'] as const;

export function WorkspaceCommandCenter({
  history, streamingChat, isLoading, onPreparePrompt, onToggleTerminal, onOpenTerminal, onSync,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [ollamaStates, setOllamaStates] = useState<Array<{ id: number; connected: boolean; configured: boolean }>>([]);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch('/api/ollama/instances', { cache: 'no-store' });
        if (!response.ok) throw new Error('unavailable');
        const data = await response.json();
        if (active) setOllamaStates(Array.isArray(data.instances) ? data.instances : []);
      } catch { if (active) setOllamaStates([]); }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const [category, setCategory] = useState<Category>('Wszystkie');
  const [search, setSearch] = useState('');
  const [selectedPane, setSelectedPane] = useState<'tools' | 'activity'>('tools');
  const recentCounts = useMemo(() => agentNames.map((agent) => ({
    agent, count: history.filter((message) => message.agent === agent || (agent === 'Aria' && message.agent === 'si_1')).length,
  })), [history]);
  const maxCount = Math.max(1, ...recentCounts.map((item) => item.count));
  const filtered = tools.filter((item) =>
    (category === 'Wszystkie' || item.category === category) &&
    (item.title + ' ' + item.description).toLocaleLowerCase('pl').includes(search.toLocaleLowerCase('pl').trim()));
  const activeAgent = streamingChat?.agents.find((item) => item.status === 'writing');
  const latest = [...history].reverse().find((message) => agentNames.includes((message.agent === 'si_1' ? 'Aria' : message.agent) as typeof agentNames[number]));
  return (
    <section className="shrink-0 border-b border-cyan-900/60 bg-[#061423]/95 text-slate-200" aria-label="Interaktywne centrum czatu">
      <div className="flex flex-wrap items-center gap-2 px-2.5 py-2 sm:px-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-500/35 bg-cyan-950/75 text-cyan-200"><Sparkles className="h-4 w-4"/></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold text-cyan-100 sm:text-xs">Bastilla Work · jeden czat, wszystkie narzędzia</p>
          <p className="truncate text-[10px] text-slate-400">
            {isLoading ? (activeAgent ? 'Generuje: ' + (activeAgent.agent === 'si_1' ? 'Aria' : activeAgent.agent) : 'Żądanie w toku…') :
              'Historia: ' + history.length + ' wiadomości · ostatni agent: ' + (latest?.agent === 'si_1' ? 'Aria' : latest?.agent || 'brak')}
          </p>
        </div>
        <div className="flex items-center gap-1.5" aria-label="Rzeczywisty status Ollama 1 i 2">
          {[1, 2].map(id => {
            const instance = ollamaStates.find(item => item.id === id);
            const online = instance?.connected === true;
            return <span key={id} title={!instance ? 'Brak odczytu' : !instance.configured ? 'Nie skonfigurowano' : online ? 'Serwer odpowiada' : 'Serwer nie odpowiada'}
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-semibold ${online ? 'border-emerald-700 text-emerald-300' : 'border-rose-800 text-rose-300'}`}>
              <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-rose-500'}`} />Ollama {id}
            </span>;
          })}
        </div>
        {isLoading && <span className="flex items-center gap-1 text-[10px] text-cyan-300" role="status">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />Generowanie
        </span>}
        <button type="button" onClick={onToggleTerminal} className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[11px] text-cyan-200 hover:border-cyan-400" title="Pokaż kartę terminala w tym czacie">
          <TerminalSquare className="inline h-3.5 w-3.5" /> <span className="hidden sm:inline">Terminal</span>
        </button>
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}
          className="flex items-center gap-1 rounded-lg border border-cyan-600/60 bg-cyan-950 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-900">
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} {expanded ? 'Zwiń' : 'Narzędzia (' + tools.length + ')'}
        </button>
      </div>
      {isLoading && <div className="h-[2px] w-full overflow-hidden bg-slate-900" aria-label="Oczekiwanie na rzeczywistą odpowiedź">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-cyan-400" />
      </div>}
      {expanded && <div className="max-h-[52dvh] overflow-y-auto border-t border-slate-800 px-2.5 pb-3 pt-2 sm:px-4">
        <div className="flex flex-wrap items-center gap-2 pb-2" role="tablist" aria-label="Widok centrum czatu">
          {(['tools', 'activity'] as const).map((pane) => <button key={pane} type="button" role="tab" aria-selected={selectedPane === pane}
            onClick={() => setSelectedPane(pane)} className={'rounded-lg px-3 py-1.5 text-[11px] font-bold ' +
              (selectedPane === pane ? 'bg-cyan-900 text-cyan-100' : 'bg-slate-900 text-slate-400 hover:text-white')}>
            {pane === 'tools' ? 'Elementy i akcje' : 'Aktywność agentów'}
          </button>)}
          {onSync && <button type="button" disabled={isLoading} onClick={onSync}
            className="ml-auto flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1.5 text-[11px] text-slate-300 disabled:opacity-40">
            <RefreshCw className="h-3 w-3"/> Synchronizuj
          </button>}
        </div>
        {selectedPane === 'tools' ? <>
          <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5">
            <Search className="h-4 w-4 text-cyan-300"/>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Znajdź element, np. curl, MCP, wideo…" aria-label="Wyszukaj narzędzie"
              className="min-w-0 flex-1 bg-transparent text-xs text-slate-100 placeholder:text-slate-500 outline-none" />
          </label>
          <div className="my-2 flex gap-1.5 overflow-x-auto pb-1" aria-label="Kategorie narzędzi">
            {categories.map((item) => <button type="button" key={item} onClick={() => setCategory(item)} aria-pressed={item === category}
              className={'shrink-0 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold ' +
                (category === item ? 'border-cyan-500 bg-cyan-950 text-cyan-100' : 'border-slate-700 bg-slate-900 text-slate-400')}>
              {item}
            </button>)}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" role="group" aria-label="Narzędzia wiadomości">
            {filtered.map((tool) => <button key={tool.title} type="button" disabled={isLoading} onClick={() => { onPreparePrompt(tool.prompt); setExpanded(false); }}
              className="flex min-h-16 min-w-0 flex-col items-start gap-1 rounded-xl border border-slate-700/90 bg-slate-900/80 p-2.5 text-left transition hover:border-cyan-400 hover:bg-cyan-950/50 disabled:opacity-40">
              <span className="flex items-center gap-1.5 text-xs font-bold text-cyan-100"><tool.icon className="h-3.5 w-3.5 shrink-0"/>{tool.title}</span>
              <span className="text-[10px] leading-snug text-slate-400">{tool.description}</span>
            </button>)}
          </div>
          {filtered.length === 0 && <p className="p-3 text-xs text-slate-400">Nie znaleziono narzędzi.</p>}
          <p className="mt-3 text-[10px] text-slate-500">Przyciski uruchamiają odczyt lub wysyłają polecenie do wybranego agenta bez wypełniania czatu. Nie wykonują instalacji ani zmian uprzywilejowanych bez zgody.</p>
        </> : <>
          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <p className="text-xs font-bold text-slate-100">Wiadomości zapisane w historii · {history.length}</p>
            {recentCounts.map((item) => <div key={item.agent} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-[11px] text-cyan-200">{item.agent}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800" aria-label={item.agent + ': ' + item.count + ' wiadomości'}>
                <div className="h-full rounded-full bg-cyan-500" style={{ width: String(item.count * 100 / maxCount) + '%' }} />
              </div>
              <span className="w-8 text-right text-[11px] tabular-nums text-slate-300">{item.count}</span>
            </div>)}
            {streamingChat && <div className="space-y-1 border-t border-slate-800 pt-2" aria-live="polite">
              <p className="text-xs font-bold text-cyan-100">Bieżąca kolejka generowania</p>
              {streamingChat.agents.length ? streamingChat.agents.map((entry) => <p key={entry.agent} className="text-[11px] text-slate-300">
                {entry.agent === 'si_1' ? 'Aria' : entry.agent}: {entry.status === 'writing' ? 'pisze…' : entry.status === 'done' ? 'zakończono' : 'błąd'}
              </p>) : <p className="text-[11px] text-slate-400">Oczekiwanie na pierwsze zdarzenie od serwera…</p>}
            </div>}
            <p className="text-[10px] text-slate-500">To liczba wiadomości, nie pomiar dostępności workerów ani ich obciążenia.</p>
            {onOpenTerminal && <button type="button" onClick={onOpenTerminal}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] text-cyan-200 hover:border-cyan-400">
              <TerminalSquare className="h-3.5 w-3.5"/> Otwórz pełny terminal
            </button>}
          </div>
        </>}
      </div>}
    </section>
  );
}
