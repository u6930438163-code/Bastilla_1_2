const AGENTS = ['Aria', 'Alex', 'Astyria', 'Aurelius'];

export async function runAgent(job, context = {}) {
  const endpoint = process.env.BASTILLA_AGENT_ENDPOINT || '';
  const apiKey = process.env.BASTILLA_AGENT_API_KEY || '';
  const agent = process.env.BASTILLA_LIVE_CHAT_AGENT || context.agent || '';

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

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new Error('Original agent endpoint timed out')), 120000);
  const signal = context.signal ? AbortSignal.any([context.signal, timeout.signal]) : timeout.signal;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ agent, job }),
      signal,
    });
    const raw = await response.text();
    if (!response.ok) throw new Error('Original agent endpoint HTTP ' + response.status + ': ' + raw.slice(0, 300));
    let result;
    try { result = JSON.parse(raw); } catch { throw new Error('Original agent endpoint did not return JSON'); }
    if (!result || typeof result.text !== 'string' || !result.text.trim()) {
      throw new Error('Original agent endpoint returned no text response');
    }
    if (result.to !== undefined && result.to !== 'Wszyscy' && !AGENTS.includes(result.to)) {
      throw new Error('Original agent endpoint returned an invalid recipient');
    }
    return {
      text: result.text.slice(0, 16000),
      ...(result.to ? { to: result.to } : {}),
    };
  } finally {
    clearTimeout(timer);
  }
}
