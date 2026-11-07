import { randomUUID } from 'node:crypto';

const AGENTS = ['Aria', 'Alex', 'Astyria', 'Aurelius'];

// Remove exactly the listener registered on AbortSignal after each poll.
// Otherwise a 24/7 worker accumulates one abandoned listener per iteration.
export function abortableSleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
}

export function createAgentWorker(options = {}) {
  const baseUrl = String(options.baseUrl || '');
  const agent = String(options.agent || '');
  const token = String(options.token || '');
  const runAgent = options.runAgent;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const pollIntervalMs = Math.max(500, Number(options.pollIntervalMs) || 2500);
  const heartbeatIntervalMs = Math.max(5000, Number(options.heartbeatIntervalMs) || 15000);
  // Limit concurrent LLM requests; async I/O does not require OS threads.
  // A per-agent cap keeps all four original runtimes isolated.
  const requestedConcurrency = Number(options.maxConcurrency);
  const maxConcurrency = Number.isInteger(requestedConcurrency)
    ? Math.min(4, Math.max(1, requestedConcurrency)) : 2;
  const policyMode = ['asymmetric', 'uniform', 'custom'].includes(options.policyMode) ? options.policyMode : null;
  const workerId = String(options.workerId || randomUUID());
  const onError = typeof options.onError === 'function' ? options.onError : () => {};
  const onIdle = typeof options.onIdle === 'function' ? options.onIdle : null;
  const idleCallbackIntervalMs = Math.max(5000, Number(options.idleCallbackIntervalMs) || 30000);
  // A model adapter may ignore AbortSignal. systemd must not hang indefinitely on shutdown.
  const requestedShutdownMs = Number(options.shutdownTimeoutMs);
  const shutdownTimeoutMs = Number.isFinite(requestedShutdownMs) && requestedShutdownMs > 0
    ? Math.min(60000, Math.max(1000, Math.floor(requestedShutdownMs))) : 15000;
  let lastIdleAt = 0;

  if (!baseUrl || !AGENTS.includes(agent) || token.length < 32 || typeof runAgent !== 'function' || typeof fetchImpl !== 'function') {
    throw new Error('Worker requires baseUrl, a named agent, a 32+ character token and a real runAgent adapter');
  }

  const apiRoot = new URL('/api/live-chat/', baseUrl);
  const internalController = new AbortController();
  let lastHeartbeatAt = 0;
  let heartbeatInFlight = null;
  let stopped = false;
  const activeJobs = new Set();

  async function request(path, requestOptions = {}) {
    const headers = {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json',
      'X-Worker-Id': workerId,
    };
    let body;
    if (requestOptions.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(requestOptions.body);
    }
    const response = await fetchImpl(new URL(path, apiRoot), {
      method: requestOptions.method || 'GET',
      headers,
      body,
      signal: requestOptions.signal,
    });
    if (response.status === 204) return null;
    const raw = await response.text();
    if (!response.ok) throw new Error('Live chat API HTTP ' + response.status + ': ' + raw.slice(0, 300));
    return raw ? JSON.parse(raw) : {};
  }

  async function sendHeartbeat(signal) {
    // One authenticated heartbeat at a time, even with multiple active async jobs.
    if (heartbeatInFlight) return heartbeatInFlight;
    const operation = (async () => {
      const heartbeatResult = await request('worker/heartbeat', {
        method: 'POST',
        body: { concurrency: maxConcurrency, ...(policyMode ? { mode: policyMode } : {}) },
        signal,
      });
      if (heartbeatResult?.agent !== agent) throw new Error('Worker token identity does not match configured agent ' + agent);
      lastHeartbeatAt = Date.now();
      return heartbeatResult;
    })();
    heartbeatInFlight = operation;
    try {
      return await operation;
    } finally {
      if (heartbeatInFlight === operation) heartbeatInFlight = null;
    }
  }

  async function verifyIdentity(signal) {
    if (Date.now() - lastHeartbeatAt >= heartbeatIntervalMs) return sendHeartbeat(signal);
    return { agent };
  }

  async function sendMessage(text, options = {}) {
    const signal = options.signal || internalController.signal;
    const channel = options.channel || 'Wszyscy';
    const to = options.to;
    if (!['Wszyscy', ...AGENTS].includes(channel)) throw new Error('Invalid live-chat channel');
    if (typeof text !== 'string' || !text.trim() || text.length > 16000) throw new Error('Message must contain 1 to 16000 characters');
    if (to !== undefined && to !== 'Wszyscy' && !AGENTS.includes(to)) throw new Error('Invalid agent recipient');
    if (to === agent) throw new Error('An agent cannot address itself');
    await verifyIdentity(signal);
    const result = await request('worker/events', {
      method: 'POST',
      body: { channel, type: 'message', text: text.trim(), ...(to ? { to } : {}) },
      signal,
    });
    return result.event;
  }

  // Expose a real, identity-bound voting action to original agent adapters.
  // No background or fabricated votes: the agent must request each vote explicitly.
  async function reactionRequest(path, options = {}) {
    const signal = options.signal || internalController.signal;
    await verifyIdentity(signal);
    const headers = { Authorization: 'Bearer ' + token, Accept: 'application/json' };
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetchImpl(new URL(path, new URL('/api/chat/reactions/', baseUrl)), {
      method: options.method || 'GET', headers, body, signal,
    });
    const raw = await response.text();
    if (!response.ok) throw new Error('Reaction API HTTP ' + response.status + ': ' + raw.slice(0, 300));
    return raw ? JSON.parse(raw) : {};
  }

  async function listReactionMessages(options = {}) {
    const result = await reactionRequest('worker/messages', options);
    return Array.isArray(result.messages) ? result.messages : [];
  }

  async function voteOnMessage(messageKey, vote, options = {}) {
    if (typeof messageKey !== 'string' ||
        !/^(?:m_[a-z0-9]{1,16}_[a-z0-9]{1,8}|l_[a-z0-9]{1,16})$/.test(messageKey) ||
        !['up', 'down', null].includes(vote)) {
      throw new Error('Vote requires an existing reaction message key and up/down/null direction');
    }
    return reactionRequest('worker/vote', {
      method: 'POST', body: { messageKey, vote }, signal: options.signal,
    });
  }

  async function claimNextJob(signal) {
    await verifyIdentity(signal);
    const claimed = await request('worker/next', { method: 'POST', body: {}, signal });
    if (claimed?.agent !== agent) throw new Error('Server worker identity mismatch for ' + agent);
    return claimed?.job || null;
  }

  async function executeJob(job, signal) {
    const heartbeat = setInterval(() => {
      Promise.all([
        sendHeartbeat(signal),
        request('worker/jobs/' + encodeURIComponent(job.id) + '/heartbeat', { method: 'POST', body: { attempt: job.attempts }, signal }),
      ]).catch(onError);
    }, heartbeatIntervalMs);
    // Do not leave a live interval behind if the original LLM adapter never settles.
    const cancelHeartbeat = () => clearInterval(heartbeat);
    if (signal.aborted) cancelHeartbeat();
    else signal.addEventListener('abort', cancelHeartbeat, { once: true });

    try {
      let output = await runAgent(job, {
        signal, agent, workerId, sendMessage, listReactionMessages, voteOnMessage,
      });
      if (typeof output === 'string') output = { text: output };
      if (!output || typeof output.text !== 'string' || !output.text.trim()) {
        throw new Error('Original agent adapter returned no message');
      }
      await request('worker/events', {
        method: 'POST',
        body: {
          channel: job.channel,
          type: 'message',
          text: output.text.slice(0, 16000),
          taskId: job.id,
          taskAttempt: job.attempts,
          ...(output.to ? { to: output.to } : {}),
        },
        signal,
      });
    } catch (error) {
      await request('worker/jobs/' + encodeURIComponent(job.id) + '/fail', {
        method: 'POST',
        body: { error: String(error?.message || error).slice(0, 1000), attempt: job.attempts },
        signal,
      }).catch(onError);
      throw error;
    } finally {
      signal.removeEventListener('abort', cancelHeartbeat);
      clearInterval(heartbeat);
    }
    return true;
  }

  // Retained for callers/tests that explicitly want a single synchronous dequeue + completion.
  async function pollOnce(options = {}) {
    const signal = options.signal || internalController.signal;
    const job = await claimNextJob(signal);
    if (!job) return false;
    return executeJob(job, signal);
  }

  async function runIdleOnce(options = {}) {
    if (!onIdle) return false;
    const signal = options.signal || internalController.signal;
    await verifyIdentity(signal);
    await onIdle({ agent, workerId, sendMessage, listReactionMessages, voteOnMessage, signal });
    return true;
  }

  async function start(options = {}) {
    if (options.signal) {
      if (options.signal.aborted) internalController.abort();
      else options.signal.addEventListener('abort', () => internalController.abort(), { once: true });
    }
    const signal = internalController.signal;

    // Keep the authenticated identity online while a real agent performs long
    // onIdle activity (which otherwise prevents polling for over 45 seconds).
    // This is a process heartbeat, NOT proof of a completed AI/model inference.
    let backgroundHeartbeatTimer = null;
    const scheduleBackgroundHeartbeat = () => {
      if (backgroundHeartbeatTimer) {
        clearTimeout(backgroundHeartbeatTimer);
        backgroundHeartbeatTimer = null;
      }
      if (stopped || signal.aborted) return;
      const delay = Math.max(0, heartbeatIntervalMs - (Date.now() - lastHeartbeatAt));
      backgroundHeartbeatTimer = setTimeout(() => {
        backgroundHeartbeatTimer = null;
        if (stopped || signal.aborted) return;
        if (Date.now() - lastHeartbeatAt < heartbeatIntervalMs) {
          scheduleBackgroundHeartbeat();
          return;
        }
        void sendHeartbeat(signal).catch((error) => {
          if (!signal.aborted && !stopped) {
            try { onError(error); } catch { /* user callback cannot crash worker */ }
          }
        }).finally(() => {
          if (!stopped && !signal.aborted) scheduleBackgroundHeartbeat();
        });
      }, delay);
    };
    scheduleBackgroundHeartbeat();

    // Each claimed task has its own promise and its own renewable lease.
    // Never allow more than maxConcurrency jobs to be active for this agent.
    try {
      while (!stopped && !signal.aborted) {
      try {
        if (activeJobs.size >= maxConcurrency) {
          await abortableSleep(pollIntervalMs, signal);
          continue;
        }

        const job = await claimNextJob(signal);
        if (signal.aborted || stopped) {
          // The lease will expire and the server will requeue this claimed task.
          break;
        }
        if (job) {
          const task = executeJob(job, signal);
          activeJobs.add(task);
          void task.catch((error) => {
            try { onError(error); } catch { /* user callback must not crash worker */ }
          }).finally(() => activeJobs.delete(task));
          continue;
        }
        // Idle activity must not compete with the original agent's active jobs.
        if (activeJobs.size === 0 && onIdle && Date.now() - lastIdleAt >= idleCallbackIntervalMs) {
          lastIdleAt = Date.now();
          try { await runIdleOnce({ signal }); } catch (error) { onError(error); }
        }
        await abortableSleep(pollIntervalMs, signal);
      } catch (error) {
        if (!signal.aborted) {
          try { onError(error); } catch { /* allow worker to retry */ }
          await abortableSleep(Math.min(30000, pollIntervalMs * 2), signal);
        }
      }
      }
    } finally {
      if (backgroundHeartbeatTimer) {
        clearTimeout(backgroundHeartbeatTimer);
        backgroundHeartbeatTimer = null;
      }
    }
    // Give cooperative adapters time to stop. A hung external model must not block restart forever.
    if (activeJobs.size) {
      let timeout;
      try {
        await Promise.race([
          Promise.allSettled([...activeJobs]),
          new Promise(resolve => { timeout = setTimeout(resolve, shutdownTimeoutMs); }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  function stop() {
    stopped = true;
    internalController.abort();
  }

  return { start, stop, pollOnce, runIdleOnce, sendMessage, listReactionMessages, voteOnMessage, workerId, agent, maxConcurrency, shutdownTimeoutMs };
}
