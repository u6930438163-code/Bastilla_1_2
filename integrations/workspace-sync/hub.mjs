import { Router } from 'express';

// Private, metadata-only fan-out. Never broadcast chat text, terminal output, passwords or keys.
// The Python kernel remains the authority for persisted state; this channel only invalidates UI caches.
const TOPICS = new Set(['chat', 'terminal', 'kernel', 'agents', 'workspace']);

export function createWorkspaceSyncHub({ requireUser, historyLimit = 120 } = {}) {
  if (typeof requireUser !== 'function') throw new Error('Workspace sync requires operator authentication');
  const router = Router();
  const listeners = new Set();
  const history = [];
  let sequence = 0;

  const send = (res, event) => {
    res.write('id: ' + event.id + '\n');
    res.write('event: change\n');
    res.write('data: ' + JSON.stringify(event) + '\n\n');
  };

  function publish(topic) {
    if (!TOPICS.has(topic)) throw new Error('Invalid workspace sync topic');
    const event = {
      id: String(++sequence),
      topic,
      at: new Date().toISOString(),
    };
    history.push(event);
    if (history.length > historyLimit) history.shift();
    for (const res of listeners) {
      if (res.writableEnded || res.destroyed) {
        listeners.delete(res);
        continue;
      }
      try { send(res, event); } catch { listeners.delete(res); }
    }
    return event;
  }

  router.get('/status', requireUser, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ mode: 'live', revision: sequence, subscribers: listeners.size });
  });

  router.get('/events', requireUser, (req, res) => {
    if (listeners.size >= 32) return res.status(429).json({ error: 'Too many workspace streams' });
    const raw = String(req.get('Last-Event-ID') || req.query.after || '');
    const after = /^\d+$/.test(raw) ? Number(raw) : sequence;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(': workspace-sync connected\n\n');
    for (const event of history) if (Number(event.id) > after) send(res, event);
    listeners.add(res);
    const heartbeat = setInterval(() => {
      if (!res.writableEnded && !res.destroyed) res.write(': heartbeat\n\n');
    }, 20000);
    heartbeat.unref?.();
    res.on('close', () => {
      clearInterval(heartbeat);
      listeners.delete(res);
    });
  });

  return { router, publish };
}
