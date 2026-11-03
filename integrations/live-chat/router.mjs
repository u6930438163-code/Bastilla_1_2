import { Router } from 'express';
import { randomUUID } from 'node:crypto';

/**
 * Bastilla live event transport.
 * IMPORTANT: supply authenticated requireUser and requireWorker middleware.
 * This module does not start AI workers, run shell commands, or pretend that agents are online.
 * Replace in-memory history with persistent storage before production deployment.
 */
export function createLiveChatRouter({ requireUser, requireWorker, dispatchToAgent, maxHistory = 500 }) {
  if (typeof requireUser !== 'function' || typeof requireWorker !== 'function') {
    throw new Error('Authentication middleware is required for both users and workers');
  }
  const router = Router();
  const channels = new Set(['Aria', 'Alex', 'Astyria', 'Aurelius', 'Wszyscy']);
  const agents = new Set(['Aria', 'Alex', 'Astyria', 'Aurelius']);
  const history = [];
  const subscribers = new Set();
  const publish = (event) => {
    const item = { id: randomUUID(), at: new Date().toISOString(), ...event };
    history.push(item);
    if (history.length > maxHistory) history.shift();
    for (const client of subscribers) client.write('data: ' + JSON.stringify(item) + '\n\n');
    return item;
  };
  router.get('/events', requireUser, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(': connected\n\n');
    subscribers.add(res);
    req.on('close', () => subscribers.delete(res));
  });
  router.get('/history', requireUser, (req, res) => {
    const channel = String(req.query.channel || 'Wszyscy');
    if (!channels.has(channel)) return res.status(400).json({ error: 'Invalid channel' });
    return res.json(history.filter((x) => x.channel === channel));
  });
  router.post('/messages', requireUser, async (req, res) => {
    const { channel, text } = req.body || {};
    if (!channels.has(channel) || typeof text !== 'string' || !text.trim() || text.length > 8000) {
      return res.status(400).json({ error: 'Invalid message' });
    }
    const item = publish({ type: 'message', channel, sender: 'user', text: text.trim() });
    if (typeof dispatchToAgent === 'function') {
      try { await dispatchToAgent(item); }
      catch (error) { publish({ type: 'delivery_error', channel, messageId: item.id, error: 'Agent backend unavailable' }); }
    }
    return res.status(202).json(item);
  });
  // Worker identity MUST come from verified authentication, never the request body.
  router.post('/worker/events', requireWorker, (req, res) => {
    const agent = req.agentIdentity;
    const { channel, type, text, taskId, status, exitCode } = req.body || {};
    if (!agents.has(agent) || !channels.has(channel) || !['message', 'terminal', 'heartbeat', 'task'].includes(type)) {
      return res.status(400).json({ error: 'Invalid agent event' });
    }
    if (text !== undefined && (typeof text !== 'string' || text.length > 16000)) {
      return res.status(400).json({ error: 'Invalid event text' });
    }
    const item = publish({ type, channel, sender: agent, text: text || '', taskId, status, exitCode });
    return res.status(202).json(item);
  });
  return router;
}
