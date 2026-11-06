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

// Only explicit decisions returned by the ORIGINAL authenticated agent may vote.
// Votes are always submitted using its verified worker identity and known message keys.
async function reactionContext(context) {
  if (typeof context.listReactionMessages !== 'function') return [];
  try {
    const messages = await context.listReactionMessages({ signal: context.signal });
    return messages.slice(-20).map(({ messageKey, kind, author, preview, votes }) => ({
      messageKey, kind, author, preview, votes,
    }));
  } catch {
    return []; // Reactions are optional, never block the original message flow.
  }
}

async function applyExplicitReactions(data, context) {
  if (!Array.isArray(data?.reactions) || typeof context.voteOnMessage !== 'function') return;
  for (const choice of data.reactions.slice(0, 5)) {
    if (!choice || typeof choice.messageKey !== 'string' ||
        !['up', 'down'].includes(choice.vote)) continue;
    try {
      await context.voteOnMessage(choice.messageKey, choice.vote, { signal: context.signal });
    } catch (error) {
      // Missing/stale keys or a disconnected server must not suppress the agent reply.
      console.warn('[ORIGINAL WORKER REACTION] Not saved:', String(error?.message || error).slice(0, 150));
    }
  }
}

export async function runAgent(job, context = {}) {
  const reactionMessages = await reactionContext(context);
  const response = await callOriginalAgent({ mode: 'task', job, reactionMessages }, context);
  const answer = validateResult(response.data);
  await applyExplicitReactions(response.data, context);
  return answer;
}

export async function onIdle(context = {}) {
  const reactionMessages = await reactionContext(context);
  const response = await callOriginalAgent({ mode: 'idle', reactionMessages }, context);
  if (response.status === 204 || !response.data || typeof response.data.text !== 'string' || !response.data.text.trim()) {
    return false;
  }
  const result = validateResult(response.data);
  await context.sendMessage(result.text, {
    channel: response.data.channel || 'Wszyscy',
    ...(result.to ? { to: result.to } : {}),
  });
  await applyExplicitReactions(response.data, context);
  return true;
}
