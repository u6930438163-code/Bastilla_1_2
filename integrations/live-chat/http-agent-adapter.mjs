const AGENTS = ['Aria', 'Alex', 'Astyria', 'Aurelius'];

function getEndpointConfig() {
  const endpoint = process.env.BASTILLA_AGENT_ENDPOINT || '';
  const apiKey = process.env.BASTILLA_AGENT_API_KEY || '';
  const agent = process.env.BASTILLA_LIVE_CHAT_AGENT || '';
  if (!AGENTS.includes(agent)) throw new Error('Set BASTILLA_LIVE_CHAT_AGENT to the original agent identity');
  if (!endpoint || Buffer.byteLength(apiKey) < 32) {
    throw new Error('The original agent endpoint and a 32+ character API key are required');
  }
  const url = new URL(endpoint);
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) {
    throw new Error('Original agent endpoints must use HTTPS (HTTP is allowed only on localhost)');
  }
  if (url.username || url.password) throw new Error('Do not embed credentials in the agent endpoint URL');
  return { url, apiKey, agent };
}

async function callOriginalAgent(payload, context = {}) {
  const config = getEndpointConfig();
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new Error('Original agent endpoint timed out')), 120000);
  const signal = context.signal ? AbortSignal.any([context.signal, timeout.signal]) : timeout.signal;
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + config.apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ agent: config.agent, ...payload }),
      signal,
    });
    if (response.status === 204) return { status: 204, data: null };
    const raw = await response.text();
    if (!response.ok) throw new Error('Original agent endpoint HTTP ' + response.status + ': ' + raw.slice(0, 300));
    let data;
    try { data = JSON.parse(raw); } catch { throw new Error('Original agent endpoint did not return JSON'); }
    return { status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function validateResult(data) {
  if (!data || typeof data.text !== 'string' || !data.text.trim()) {
    throw new Error('Original agent endpoint returned no text response');
  }
  if (data.to !== undefined && data.to !== 'Wszyscy' && !AGENTS.includes(data.to)) {
    throw new Error('Original agent endpoint returned an invalid recipient');
  }
  return {
    text: data.text.slice(0, 16000),
    ...(data.to ? { to: data.to } : {}),
  };
}

export async function runAgent(job, context = {}) {
  const response = await callOriginalAgent({ mode: 'task', job }, context);
  return validateResult(response.data);
}

export async function onIdle(context = {}) {
  const response = await callOriginalAgent({ mode: 'idle' }, context);
  if (response.status === 204 || !response.data || typeof response.data.text !== 'string' || !response.data.text.trim()) {
    return false;
  }
  const result = validateResult(response.data);
  await context.sendMessage(result.text, {
    channel: response.data.channel || 'Wszyscy',
    ...(result.to ? { to: result.to } : {}),
  });
  return true;
}
