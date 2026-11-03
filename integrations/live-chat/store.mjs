import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const LIVE_CHAT_AGENTS = Object.freeze(['Aria', 'Alex', 'Astyria', 'Aurelius']);

function makeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export class LiveChatStore {
  constructor(options = {}) {
    this.filePath = path.resolve(options.filePath || process.env.BASTILLA_LIVE_CHAT_STORE_PATH || 'data/live-chat-state.json');
    this.maxEvents = options.maxEvents || 5000;
    this.maxJobs = options.maxJobs || 2000;
    this.maxAgentHops = options.maxAgentHops || 8;
    this.maxAgentMessagesPerMinute = options.maxAgentMessagesPerMinute || 30;
    this.maxPendingPerAgent = options.maxPendingPerAgent || 100;
    this.maxJobAttempts = options.maxJobAttempts || 3;
    this.onlineTtlMs = options.onlineTtlMs || 45000;
    this.now = options.now || (() => Date.now());
    this.writeQueue = Promise.resolve();
    this.state = { version: 1, events: [], jobs: [], heartbeats: {} };
    this.load();
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.events) ||
          !Array.isArray(parsed.jobs) || !parsed.heartbeats || typeof parsed.heartbeats !== 'object') {
        throw new Error('Invalid live-chat state schema');
      }
      this.state = {
        version: 1,
        events: parsed.events.slice(-this.maxEvents),
        jobs: parsed.jobs.slice(-this.maxJobs),
        heartbeats: parsed.heartbeats,
      };
    } catch (error) {
      if (error && error.code === 'ENOENT') return;
      throw new Error('Live chat state could not be loaded safely: ' + String(error?.message || error));
    }
  }

  async mutate(mutator) {
    const operation = this.writeQueue.then(async () => {
      const next = structuredClone(this.state);
      const result = mutator(next);
      await this.persist(next);
      this.state = next;
      return result === undefined ? undefined : structuredClone(result);
    });
    this.writeQueue = operation.catch(() => {});
    return operation;
  }

  async persist(state) {
    const directory = path.dirname(this.filePath);
    await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = this.filePath + '.' + process.pid + '.' + randomUUID() + '.tmp';
    const handle = await fs.promises.open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(state));
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await fs.promises.rename(temporary, this.filePath);
      try {
        const directoryHandle = await fs.promises.open(directory, 'r');
        await directoryHandle.sync();
        await directoryHandle.close();
      } catch {
        // Directory fsync is not supported by every filesystem.
      }
    } catch (error) {
      await fs.promises.unlink(temporary).catch(() => {});
      throw error;
    }
  }

  addEvent(state, fields) {
    const event = {
      id: randomUUID(),
      at: new Date(this.now()).toISOString(),
      read: false,
      ...fields,
    };
    state.events.push(event);
    if (state.events.length > this.maxEvents) state.events.splice(0, state.events.length - this.maxEvents);
    return event;
  }

  addJob(state, fields) {
    if (state.jobs.length >= this.maxJobs) {
      const removable = state.jobs
        .filter((job) => job.status === 'completed' || job.status === 'failed')
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      while (state.jobs.length >= this.maxJobs && removable.length) {
        const candidate = removable.shift();
        const index = state.jobs.findIndex((job) => job.id === candidate.id);
        if (index >= 0) state.jobs.splice(index, 1);
      }
    }
    if (state.jobs.length >= this.maxJobs) throw makeError('QUEUE_FULL');
    const job = {
      id: randomUUID(),
      status: 'queued',
      attempts: 0,
      createdAt: new Date(this.now()).toISOString(),
      availableAt: this.now(),
      ...fields,
    };
    state.jobs.push(job);
    return job;
  }

  async createUserMessage({ channel, text, recipients }) {
    const targets = [...new Set(recipients || [])];
    if (!targets.length || targets.some((agent) => !LIVE_CHAT_AGENTS.includes(agent))) {
      throw makeError('INVALID_RECIPIENT');
    }
    return this.mutate((state) => {
      for (const agent of targets) {
        const pending = state.jobs.filter((job) => job.to === agent && (job.status === 'queued' || job.status === 'running')).length;
        if (pending >= this.maxPendingPerAgent) throw makeError('QUEUE_FULL');
      }
      const conversationId = randomUUID();
      const event = this.addEvent(state, {
        type: 'message',
        channel,
        sender: 'user',
        text,
        conversationId,
        hop: 0,
      });
      const jobs = targets.map((agent) => this.addJob(state, {
        messageId: event.id,
        conversationId,
        from: 'user',
        to: agent,
        channel,
        text,
        hop: 0,
      }));
      return { event, jobs };
    });
  }

  async createAgentEvent({ agent, channel, type, text, taskId, to, status, exitCode }) {
    if (!LIVE_CHAT_AGENTS.includes(agent)) throw makeError('INVALID_AGENT');
    return this.mutate((state) => {
      const now = this.now();
      const recent = state.events.filter((event) =>
        event.sender === agent && event.type === 'message' && now - Date.parse(event.at) < 60000
      ).length;
      if (recent >= this.maxAgentMessagesPerMinute) throw makeError('AGENT_RATE_LIMIT');

      let sourceJob = null;
      if (taskId) {
        sourceJob = state.jobs.find((job) => job.id === taskId && job.to === agent);
        if (!sourceJob || sourceJob.status !== 'running') throw makeError('JOB_NOT_OWNED');
      }

      const eventHop = sourceJob ? (Number(sourceJob.hop) || 0) + 1 : 0;
      const recipients = !to ? [] : to === 'Wszyscy'
        ? LIVE_CHAT_AGENTS.filter((name) => name !== agent)
        : [to];
      if (recipients.length && eventHop >= this.maxAgentHops) throw makeError('AGENT_HOP_LIMIT');
      for (const recipient of recipients) {
        const pending = state.jobs.filter((job) => job.to === recipient && (job.status === 'queued' || job.status === 'running')).length;
        if (pending >= this.maxPendingPerAgent) throw makeError('QUEUE_FULL');
      }

      const conversationId = sourceJob?.conversationId || randomUUID();
      const event = this.addEvent(state, {
        type,
        channel,
        sender: agent,
        text: text || '',
        conversationId,
        hop: eventHop,
        ...(taskId ? { taskId } : {}),
        ...(to ? { to } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(exitCode !== undefined ? { exitCode } : {}),
      });

      if (sourceJob && type === 'message') {
        sourceJob.status = 'completed';
        sourceJob.completedAt = new Date(now).toISOString();
        delete sourceJob.leaseUntil;
        delete sourceJob.workerId;
      } else if (sourceJob && type === 'task' && status === 'completed') {
        sourceJob.status = 'completed';
        sourceJob.completedAt = new Date(now).toISOString();
        delete sourceJob.leaseUntil;
        delete sourceJob.workerId;
      } else if (sourceJob && type === 'task' && status === 'failed') {
        sourceJob.status = 'failed';
        sourceJob.error = 'Agent reported task failure';
        sourceJob.completedAt = new Date(now).toISOString();
        delete sourceJob.leaseUntil;
        delete sourceJob.workerId;
      }

      const jobs = recipients.map((recipient) => this.addJob(state, {
        messageId: event.id,
        conversationId,
        from: agent,
        to: recipient,
        channel,
        text: text || '',
        hop: eventHop + 1,
      }));
      return { event, jobs };
    });
  }

  async claimNext(agent, workerId, leaseMs = 60000) {
    if (!LIVE_CHAT_AGENTS.includes(agent)) throw makeError('INVALID_AGENT');
    await this.writeQueue;
    const now = this.now();
    const available = this.state.jobs.some((job) =>
      job.to === agent && (
        (job.status === 'queued' && job.availableAt <= now) ||
        (job.status === 'running' && Number(job.leaseUntil) <= now)
      )
    );
    if (!available) return null;

    return this.mutate((state) => {
      const candidates = state.jobs
        .filter((candidate) => candidate.to === agent && (
          (candidate.status === 'queued' && candidate.availableAt <= now) ||
          (candidate.status === 'running' && Number(candidate.leaseUntil) <= now)
        ))
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      let job = null;
      for (const candidate of candidates) {
        if (candidate.status === 'running' && Number(candidate.leaseUntil) <= now && candidate.attempts >= this.maxJobAttempts) {
          candidate.status = 'failed';
          candidate.error = 'Worker lease expired after maximum attempts';
          candidate.completedAt = new Date(now).toISOString();
          delete candidate.leaseUntil;
          delete candidate.workerId;
          continue;
        }
        job = candidate;
        break;
      }
      if (!job) return null;
      job.status = 'running';
      job.attempts += 1;
      job.workerId = workerId;
      job.leaseUntil = now + Math.max(10000, leaseMs);
      job.startedAt = job.startedAt || new Date(now).toISOString();
      return job;
    });
  }

  async renewLease({ id, agent, workerId, leaseMs = 60000 }) {
    return this.mutate((state) => {
      const job = state.jobs.find((candidate) => candidate.id === id && candidate.to === agent);
      if (!job || job.status !== 'running' || job.workerId !== workerId) throw makeError('JOB_NOT_OWNED');
      job.leaseUntil = this.now() + Math.max(10000, leaseMs);
      return job;
    });
  }

  async failJob({ id, agent, error, retryDelayMs = 3000, maxAttempts = this.maxJobAttempts }) {
    return this.mutate((state) => {
      const job = state.jobs.find((candidate) => candidate.id === id && candidate.to === agent);
      if (!job || job.status !== 'running') throw makeError('JOB_NOT_OWNED');
      job.error = String(error || 'Worker failed').slice(0, 1000);
      delete job.leaseUntil;
      delete job.workerId;
      if (job.attempts < maxAttempts) {
        job.status = 'queued';
        job.availableAt = this.now() + Math.max(0, retryDelayMs);
      } else {
        job.status = 'failed';
        job.completedAt = new Date(this.now()).toISOString();
      }
      return job;
    });
  }

  async heartbeat(agent, workerId) {
    if (!LIVE_CHAT_AGENTS.includes(agent)) throw makeError('INVALID_AGENT');
    return this.mutate((state) => {
      const heartbeat = {
        agent,
        workerId: String(workerId || agent).slice(0, 128),
        lastSeen: new Date(this.now()).toISOString(),
      };
      state.heartbeats[agent] = heartbeat;
      return heartbeat;
    });
  }

  async markRead(id) {
    return this.mutate((state) => {
      const event = state.events.find((item) => item.id === id);
      if (!event) throw makeError('MESSAGE_NOT_FOUND');
      event.read = true;
      return event;
    });
  }

  getHistory(channel = 'Wszyscy', limit = 500) {
    const events = channel === 'Wszyscy'
      ? this.state.events
      : this.state.events.filter((event) => event.channel === channel);
    return structuredClone(events.slice(-Math.max(1, Math.min(2000, limit))));
  }

  getEventsAfter(id, limit = 100) {
    if (!id) return structuredClone(this.state.events.slice(-limit));
    const index = this.state.events.findIndex((event) => event.id === id);
    if (index < 0) return structuredClone(this.state.events.slice(-limit));
    return structuredClone(this.state.events.slice(index + 1));
  }

  getStatus() {
    const now = this.now();
    const agents = Object.fromEntries(LIVE_CHAT_AGENTS.map((agent) => {
      const heartbeat = this.state.heartbeats[agent] || null;
      const lastSeenMs = heartbeat ? Date.parse(heartbeat.lastSeen) : 0;
      return [agent, {
        status: lastSeenMs && now - lastSeenMs <= this.onlineTtlMs ? 'online' : 'offline',
        lastSeen: heartbeat?.lastSeen || null,
        queued: this.state.jobs.filter((job) => job.to === agent && job.status === 'queued').length,
        running: this.state.jobs.filter((job) => job.to === agent && job.status === 'running').length,
      }];
    }));
    return {
      agents,
      unread: this.state.events.filter((event) => event.sender !== 'user' && !event.read).length,
      queue: {
        queued: this.state.jobs.filter((job) => job.status === 'queued').length,
        running: this.state.jobs.filter((job) => job.status === 'running').length,
        failed: this.state.jobs.filter((job) => job.status === 'failed').length,
      },
    };
  }
}
