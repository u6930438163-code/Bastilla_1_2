import { Router } from 'express';
import { diagnosticInventory, diagnosticSnapshot } from '../diagnostics/catalog.mjs';

// Operator-only, read-only diagnostics. No shell input or privileged process controls.
// Do not expose command lines, environment variables or unredacted stack traces.
export function redactDiagnostic(value) {
  return String(value ?? '')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|AIza[A-Za-z0-9_-]{20,})\b/g, '[REDACTED]')
    .replace(/\b(Bearer)\s+[^\s,;"']+/gi, '$1 [REDACTED]')
    .replace(/\b(password|passwd|api[_-]?key|token|secret|authorization)\b(\s*[:=]\s*["']?)[^\s,;"'}]+/gi, '$1$2[REDACTED]')
    .replace(/([?&](?:key|token|secret|password|api_key)=)[^\s&]+/gi, '$1[REDACTED]')
    .slice(0, 900);
}

export function parseProcessSnapshot(output) {
  return String(output || '').split('\n').map(line => {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(\S+)$/);
    if (!m) return null;
    const cpu = Number(m[4]);
    const rss = Number(m[5]);
    if (!Number.isSafeInteger(Number(m[1])) || !Number.isFinite(cpu) || !Number.isFinite(rss)) return null;
    return {
      pid: Number(m[1]),
      ppid: Number(m[2]),
      name: m[3].slice(0, 80),
      cpuPercent: cpu,
      rssBytes: rss * 1024,
      state: m[6].slice(0, 12),
      elapsed: m[7],
    };
  }).filter(Boolean).sort((a, b) => b.cpuPercent - a.cpuPercent).slice(0, 80);
}

function classifyLog(log) {
  if (log?.level === 'error' || log?.level === 'warn') return 'error';
  if (log?.level === 'healed') return 'success';
  return 'info';
}

export function makeLogsSnapshot(entries, filter = 'all') {
  const recent = Array.isArray(entries) ? entries.slice(-300) : [];
  const counts = { all: recent.length, errors: 0, success: 0, info: 0 };
  const logs = recent.map(log => {
    const category = classifyLog(log);
    if (category === 'error') counts.errors++;
    else if (category === 'success') counts.success++;
    else counts.info++;
    return {
      id: String(log?.id || ''),
      timestamp: String(log?.timestamp || ''),
      level: ['error', 'warn', 'healed', 'info'].includes(log?.level) ? log.level : 'info',
      category,
      source: String(log?.source || 'SYSTEM').slice(0, 40),
      message: redactDiagnostic(log?.message),
    };
  }).filter(log => filter === 'all' || log.category === (filter === 'errors' ? 'error' : filter)).slice(-100).reverse();
  return { counts, logs, sampled: recent.length, source: 'server-runtime-logs' };
}

export async function probeOllama({ baseUrl, configuredModel, providers, localFallback, keepAlive }, fetchImpl = fetch) {
  const base = String(baseUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const get = async path => {
    const response = await fetchImpl(base + path, { signal: AbortSignal.timeout(3500), redirect: 'error' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  };
  const [version, tags, loaded] = await Promise.allSettled([
    get('/api/version'), get('/api/tags'), get('/api/ps'),
  ]);
  const online = version.status === 'fulfilled' || tags.status === 'fulfilled' || loaded.status === 'fulfilled';
  const runningModels = loaded.status === 'fulfilled' && Array.isArray(loaded.value?.models)
    ? loaded.value.models.map(item => ({
      name: String(item.name || item.model || '').slice(0, 128),
      sizeBytes: Number.isFinite(item.size) ? Math.max(0, item.size) : null,
      vramBytes: Number.isFinite(item.size_vram) ? Math.max(0, item.size_vram) : null,
      estimatedRamBytes: Number.isFinite(item.size) && Number.isFinite(item.size_vram)
        ? Math.max(0, item.size - item.size_vram) : null,
      expiresAt: typeof item.expires_at === 'string' ? item.expires_at : null,
    })) : null;
  const installedModels = tags.status === 'fulfilled' && Array.isArray(tags.value?.models)
    ? tags.value.models.map(item => ({
      name: String(item.name || item.model || '').slice(0, 128),
      sizeBytes: Number.isFinite(item.size) ? Math.max(0, item.size) : null,
    })).slice(0, 60) : null;
  const selected = String(configuredModel || 'auto');
  const modelLoaded = runningModels === null ? null
    : selected === 'auto' ? runningModels.length > 0
    : runningModels.some(m => m.name === selected || m.name.split(':')[0] === selected.split(':')[0] && !selected.includes(':'));
  return {
    connected: online,
    apiVersion: version.status === 'fulfilled' ? String(version.value?.version || 'unknown') : null,
    configuredModel: selected,
    modelLoaded,
    memoryCheckAvailable: runningModels !== null,
    runningModels,
    installedModels,
    configuredProviders: Array.isArray(providers) ? providers : [],
    localFallback: Boolean(localFallback),
    keepAlive: String(keepAlive || ''),
    error: online ? null : 'Ollama API nie odpowiada. Sprawdź usługę i połączenie sieciowe.',
    note: 'Lista modeli w pamięci pochodzi z /api/ps. RAM jest estymacją przydziału modelu (size - size_vram), nie odczytem całego RSS procesu. Brak /api/ps oznacza stan nieznany.',
    checkedAt: new Date().toISOString(),
  };
}

export function createOperationsRouter({ requireUser, getLogs, getConfig, execFileAsync, fetchImpl = fetch }) {
  if (typeof requireUser !== 'function' || typeof getLogs !== 'function' || typeof getConfig !== 'function' ||
      typeof execFileAsync !== 'function') throw new Error('Missing operations dependencies');
  const router = Router();
  router.use(requireUser);
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  router.get('/diagnostics/tools', (_req, res) => res.json(diagnosticInventory()));
  router.get('/diagnostics/snapshot', (_req, res) => res.json(diagnosticSnapshot()));

  router.get('/logs', (_req, res) => {
    const filter = ['all', 'errors', 'success', 'info'].includes(String(_req.query.filter))
      ? String(_req.query.filter) : 'all';
    res.json(makeLogsSnapshot(getLogs(), filter));
  });

  router.get('/processes', async (_req, res) => {
    try {
      if (process.platform === 'win32') return res.json({ available: false, processes: [], error: 'Linux ps unavailable on Windows' });
      const { stdout } = await execFileAsync('ps', ['-eo', 'pid=,ppid=,comm=,%cpu=,rss=,stat=,etime='], {
        timeout: 3500, maxBuffer: 512 * 1024,
      });
      return res.json({
        available: true,
        source: 'host-process-snapshot',
        processes: parseProcessSnapshot(stdout),
        sampledAt: new Date().toISOString(),
        currentPid: process.pid,
      });
    } catch {
      return res.json({ available: false, processes: [], error: 'Lista procesów hosta jest niedostępna; nie pokazujemy danych symulowanych.' });
    }
  });

  router.get('/ollama', async (_req, res) => {
    try { res.json(await probeOllama(getConfig(), fetchImpl)); }
    catch { res.json({ connected: false, configuredModel: getConfig().configuredModel, memoryCheckAvailable: false, modelLoaded: null,
      runningModels: null, installedModels: null, error: 'Diagnoza Ollamy nie powiodła się.' }); }
  });
  return router;
}
