import { randomUUID } from 'node:crypto';

const AGENTS = ['Aria', 'Alex', 'Astyria', 'Aurelius'];

function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      done();
    }, { once: true });
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
  const workerId = String(options.workerId || randomUUID());
  const onError = typeof options.onError === 'function' ? options.onError : () => {};

  if (!baseUrl || !AGENTS.includes(agent) || token.length < 32 || typeof runAgent !== 'function' || typeof fetchImpl !== 'function') {
    throw new Error('Worker requires baseUrl, a named agent, a 32+ character token and a real runAgent adapter');
  }

  const apiRoot = new URL('/api/live-chat/', baseUrl);
  const internalController = new AbortController();
  let stopped = false;

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

  async function verifyIdentity(signal) {
    const heartbeatResult = await request('worker/heartbeat', { method: 'POST', body: {}, signal });
    if (heartbeatResult?.agent !== agent) throw new Error('Worker token identity does not match configured agent ' + agent);
    return heartbeatResult;
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

  async function pollOnce(options = {}) {
    const signal = options.signal || internalController.signal;
    await verifyIdentity(signal);
    const claimed = await request('worker/next', { method: 'POST', body: {}, signal });
    if (claimed?.agent !== agent) throw new Error('Server worker identity mismatch for ' + agent);
    if (!claimed?.job) return false;

    const job = claimed.job;
    const heartbeat = setInterval(() => {
      Promise.all([
        request('worker/heartbeat', { method: 'POST', body: {}, signal }),
        request('worker/jobs/' + encodeURIComponent(job.id) + '/heartbeat', { method: 'POST', body: {}, signal }),
      ]).catch(onError);
    }, heartbeatIntervalMs);

    try {
      let output = await runAgent(job, { signal, agent, workerId, sendMessage });
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
          ...(output.to ? { to: output.to } : {}),
        },
        signal,
      });
    } catch (error) {
      await request('worker/jobs/' + encodeURIComponent(job.id) + '/fail', {
        method: 'POST',
        body: { error: String(error?.message || error).slice(0, 1000) },
        signal,
      }).catch(onError);
      throw error;
    } finally {
      clearInterval(heartbeat);
    }
    return true;
  }

  async function start(options = {}) {
    if (options.signal) {
      if (options.signal.aborted) internalController.abort();
      else options.signal.addEventListener('abort', () => internalController.abort(), { once: true });
    }
    const signal = internalController.signal;
    while (!stopped && !signal?.aborted) {
      try {
        const handled = await pollOnce({ signal });
        if (!handled) await sleep(pollIntervalMs, signal);
      } catch (error) {
        onError(error);
        await sleep(Math.min(30000, pollIntervalMs * 2), signal);
      }
    }
  }

  function stop() {
    stopped = true;
    internalController.abort();
  }

  return { start, stop, pollOnce, sendMessage, workerId, agent };
}
