import { Router } from 'express';
import { LIVE_CHAT_AGENTS } from './store.mjs';

const CHANNELS = new Set(['Wszyscy', ...LIVE_CHAT_AGENTS]);

function errorStatus(error) {
  if (error?.code === 'JOB_NOT_OWNED') return 409;
  if (error?.code === 'MESSAGE_NOT_FOUND') return 404;
  if (error?.code === 'QUEUE_FULL' || error?.code === 'AGENT_RATE_LIMIT' || error?.code === 'AGENT_HOP_LIMIT') return 429;
  if (error?.code === 'INVALID_RECIPIENT' || error?.code === 'INVALID_AGENT') return 400;
  return 500;
}

export function createLiveChatRouter(options = {}) {
  const { store, requireUser, requireWorker, session, leaseMs = 60000 } = options;
  if (!store || typeof requireUser !== 'function' || typeof requireWorker !== 'function' || !session) {
    throw new Error('Live chat requires a store, user authentication, worker authentication and session handlers');
  }

  const router = Router();
  const subscribers = new Set();

  function sendEvent(response, item) {
    response.write('id: ' + item.id + '\ndata: ' + JSON.stringify(item) + '\n\n');
  }

  function broadcast(item) {
    for (const response of subscribers) {
      if (response.writableEnded || response.destroyed) continue;
      try { sendEvent(response, item); } catch { subscribers.delete(response); }
    }
  }

  router.post('/session', session.login);
  router.get('/session', requireUser, session.session);
  router.delete('/session', requireUser, session.logout);

  router.get('/history', requireUser, (req, res) => {
    const channel = String(req.query.channel || 'Wszyscy');
    if (!CHANNELS.has(channel)) return res.status(400).json({ error: 'Invalid channel' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ messages: store.getHistory(channel) });
  });

  router.get('/status', requireUser, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.json(store.getStatus());
  });

  router.get('/events', requireUser, (req, res) => {
    const after = String(req.get('Last-Event-ID') || req.query.after || '');
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(': connected\n\n');
    for (const item of store.getEventsAfter(after)) sendEvent(res, item);
    subscribers.add(res);
    const keepAlive = setInterval(() => {
      if (!res.writableEnded && !res.destroyed) res.write(': ping\n\n');
    }, 15000);
    keepAlive.unref?.();
    res.on('close', () => {
      clearInterval(keepAlive);
      subscribers.delete(res);
    });
  });

  router.post('/messages', requireUser, async (req, res) => {
    const channel = req.body?.channel;
    const text = req.body?.text;
    if (!CHANNELS.has(channel) || typeof text !== 'string' || !text.trim() || text.length > 8000) {
      return res.status(400).json({ error: 'Expected a valid channel and a message of 1 to 8000 characters' });
    }
    const recipients = channel === 'Wszyscy' ? LIVE_CHAT_AGENTS : [channel];
    try {
      const result = await store.createUserMessage({ channel, text: text.trim(), recipients });
      broadcast(result.event);
      return res.status(202).json({
        event: result.event,
        queuedFor: recipients,
        queued: result.jobs.map((job) => ({ id: job.id, agent: job.to, status: job.status })),
      });
    } catch (error) {
      return res.status(errorStatus(error)).json({ error: error?.code || 'Unable to queue message' });
    }
  });

  router.post('/messages/:id/read', requireUser, async (req, res) => {
    try {
      await store.markRead(req.params.id);
      return res.json({ success: true });
    } catch (error) {
      return res.status(errorStatus(error)).json({ error: error?.code || 'Unable to mark message read' });
    }
  });

  router.post('/worker/heartbeat', requireWorker, async (req, res) => {
    try {
      const agent = req.agentIdentity;
      const workerId = String(req.get('X-Worker-Id') || agent).slice(0, 128);
      const concurrency = Number.isInteger(req.body?.concurrency) && req.body.concurrency >= 1 && req.body.concurrency <= 4
        ? req.body.concurrency : 1;
      const heartbeat = await store.heartbeat(agent, workerId, concurrency);
      return res.json({ success: true, agent, lastSeen: heartbeat.lastSeen });
    } catch (error) {
      return res.status(errorStatus(error)).json({ error: error?.code || 'Heartbeat failed' });
    }
  });

  router.post('/worker/next', requireWorker, async (req, res) => {
    try {
      const agent = req.agentIdentity;
      const workerId = String(req.get('X-Worker-Id') || agent).slice(0, 128);
      const job = await store.claimNext(agent, workerId, leaseMs);
      return res.json({ agent, job });
    } catch (error) {
      return res.status(errorStatus(error)).json({ error: error?.code || 'Unable to claim work' });
    }
  });

  router.post('/worker/events', requireWorker, async (req, res) => {
    const agent = req.agentIdentity;
    const channel = req.body?.channel || 'Wszyscy';
    const type = req.body?.type;
    const text = req.body?.text;
    const taskId = req.body?.taskId;
    const to = req.body?.to;
    const status = req.body?.status;
    const exitCode = req.body?.exitCode;
    if (!CHANNELS.has(channel) || !['message', 'terminal', 'task'].includes(type)) {
      return res.status(400).json({ error: 'Invalid channel or event type' });
    }
    if ((type === 'message' || type === 'terminal') &&
        (typeof text !== 'string' || !text.trim() || text.length > 16000)) {
      return res.status(400).json({ error: 'Message and terminal events require 1 to 16000 characters' });
    }
    if (type === 'task' && status !== undefined && !['running', 'completed', 'failed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid task status' });
    }
    if (taskId !== undefined && (typeof taskId !== 'string' || taskId.length > 100)) {
      return res.status(400).json({ error: 'Invalid task id' });
    }
    if (to !== undefined && to !== 'Wszyscy' && !LIVE_CHAT_AGENTS.includes(to)) {
      return res.status(400).json({ error: 'Invalid recipient' });
    }
    if (to === agent) return res.status(400).json({ error: 'An agent cannot address itself' });
    if (exitCode !== undefined && !Number.isInteger(exitCode)) {
      return res.status(400).json({ error: 'Invalid exit code' });
    }
    try {
      const result = await store.createAgentEvent({ agent, channel, type, text, taskId, to, status, exitCode });
      broadcast(result.event);
      return res.status(202).json({
        event: result.event,
        queuedFor: result.jobs.map((job) => job.to),
      });
    } catch (error) {
      return res.status(errorStatus(error)).json({ error: error?.code || 'Unable to save agent event' });
    }
  });

  router.post('/worker/jobs/:id/heartbeat', requireWorker, async (req, res) => {
    try {
      const job = await store.renewLease({
        id: req.params.id,
        agent: req.agentIdentity,
        workerId: String(req.get('X-Worker-Id') || req.agentIdentity).slice(0, 128),
        leaseMs,
      });
      return res.json({ success: true, leaseUntil: job.leaseUntil });
    } catch (error) {
      return res.status(errorStatus(error)).json({ error: error?.code || 'Unable to renew worker lease' });
    }
  });

  router.post('/worker/jobs/:id/fail', requireWorker, async (req, res) => {
    const errorText = typeof req.body?.error === 'string' ? req.body.error.slice(0, 1000) : 'Worker failed';
    try {
      const job = await store.failJob({
        id: req.params.id,
        agent: req.agentIdentity,
        error: errorText,
      });
      return res.status(202).json({ success: true, job });
    } catch (error) {
      return res.status(errorStatus(error)).json({ error: error?.code || 'Unable to release failed job' });
    }
  });

  return router;
}
