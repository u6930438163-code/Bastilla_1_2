/**
 * Pure, read-only data adapter for live work-chat status cards.
 * Only known same-origin endpoints may be requested. AI never controls a URL.
 */
const AGENTS = Object.freeze(['Aria', 'Alex', 'Astyria', 'Aurelius']);
const PATHS = Object.freeze({
  ollama_inventory: '/api/ollama/models',
  agent_monitor: '/api/agents/background/status',
});

export function getLiveStatusSpec(block) {
  if (!block || typeof block !== 'object' || Array.isArray(block) || block.type !== 'live_status') return null;
  const live = block.live;
  if (!live || typeof live !== 'object' || Array.isArray(live)) return null;
  if (!Object.prototype.hasOwnProperty.call(PATHS, live.source)) return null;
  const raw = typeof live.intervalMs === 'number' && Number.isFinite(live.intervalMs) ? live.intervalMs : 15000;
  return { source: live.source, intervalMs: Math.max(5000, Math.min(30000, Math.round(raw))) };
}

export function getLiveStatusPath(source) {
  return Object.prototype.hasOwnProperty.call(PATHS, source) ? PATHS[source] : null;
}

const str = (v, max = 120) => typeof v === 'string' ? v.slice(0, max) : '';
const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

export function parseLiveStatus(source, payload) {
  if (!obj(payload)) throw new Error('Nieprawidłowa odpowiedź serwera');
  if (source === 'ollama_inventory') {
    if (typeof payload.connected !== 'boolean') throw new Error('Brak pola connected w odpowiedzi Ollama');
    const modelList = Array.isArray(payload.models) ? payload.models : [];
    return {
      source, connected: payload.connected,
      configuredModel: str(payload.configuredModel),
      models: modelList.slice(0, 30).filter(obj).map(model => str(model.name || model.model, 120)).filter(Boolean),
      error: !payload.connected ? str(payload.error, 180) : '',
    };
  }
  if (source === 'agent_monitor') {
    if (payload.monitoring !== true || !obj(payload.agents)) throw new Error('Brak poprawnego monitoringu agentów');
    return {
      source,
      // The backend checks a shared Ollama endpoint, not real worker execution.
      agents: AGENTS.map(name => {
        const raw = obj(payload.agents[name]) ? payload.agents[name] : null;
        return {
          name,
          status: raw && ['online', 'offline', 'waiting'].includes(raw.status) ? raw.status : 'waiting',
          enabled: raw?.enabled === true,
          lastCheck: str(raw?.lastCheck, 60),
          error: str(raw?.error, 180),
        };
      }),
      note: 'Monitoring wspólnego połączenia Ollama. To nie jest dowód pracy procesu agenta.',
    };
  }
  throw new Error('Nieobsługiwane źródło danych LIVE');
}
