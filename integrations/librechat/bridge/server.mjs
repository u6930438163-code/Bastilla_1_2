import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';

// OpenAI-compatible, non-streaming adapter to the EXISTING Bastilla live-chat queue.
// No new AI identity, synthetic replies, arbitrary tool execution or public listener.
const AGENTS = Object.freeze(['Aria', 'Alex', 'Astyria', 'Aurelius']);
const API_KEY = process.env.BASTILLA_BRIDGE_API_KEY || '';
const PASSWORD = process.env.BASTILLA_LIVE_CHAT_USER_PASSWORD || '';
const ORIGIN = process.env.BASTILLA_LIVE_CHAT_ALLOWED_ORIGIN || '';
const BASE = (process.env.BASTILLA_API_BASE_URL || '').replace(/\/+$/, '');
const PORT = Number(process.env.PORT || 8085);
const WAIT_MS = 90000;
let sessionCookie = '';
let active = 0;
let loginPromise = null;

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function validateConfig() {
  if (Buffer.byteLength(API_KEY) < 32 || PASSWORD.length < 16) {
    throw new Error('Bridge key (32+ bytes) and Bastilla operator password (16+ characters) are required');
  }
  const base = new URL(BASE);
  const allowedLocalHttp = base.protocol === 'http:' &&
    ['localhost', '127.0.0.1', 'host.docker.internal', '[::1]'].includes(base.hostname);
  if ((!allowedLocalHttp && base.protocol !== 'https:') || base.username || base.password ||
      base.pathname !== '/' || base.search || base.hash) {
    throw new Error('BASTILLA_API_BASE_URL must be a clean HTTPS origin (or a known local Docker host)');
  }
  const origin = new URL(ORIGIN);
  const allowedWebHttp = origin.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if ((!allowedWebHttp && origin.protocol !== 'https:') ||
      origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('BASTILLA_LIVE_CHAT_ALLOWED_ORIGIN must be a clean HTTPS origin (or localhost)');
  }
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('Invalid bridge PORT');
}

function secureEqual(value, secret) {
  const a = Buffer.from(value || '');
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function reply(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

async function login() {
  if (loginPromise) return loginPromise;
  loginPromise = (async () => {
    const response = await fetch(BASE + '/api/live-chat/session', {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: PASSWORD }),
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) throw fail(502, 'Bastilla live-chat login failed (HTTP ' + response.status + ')');
    const cookie = (response.headers.get('set-cookie') || '').split(';')[0];
    if (!cookie.startsWith('bastilla_live_chat_session=')) {
      throw fail(502, 'Bastilla login response has no session cookie');
    }
    sessionCookie = cookie;
  })();
  try { await loginPromise; } finally { loginPromise = null; }
}

async function bastilla(path, method = 'GET', body = undefined, retry = true) {
  if (!sessionCookie) await login();
  const response = await fetch(BASE + '/api/live-chat' + path, {
    method,
    headers: {
      Origin: ORIGIN,
      Cookie: sessionCookie,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (response.status === 401 && retry) {
    sessionCookie = '';
    return bastilla(path, method, body, false);
  }
  if (!response.ok) throw fail(502, 'Bastilla live-chat API returned HTTP ' + response.status);
  try { return await response.json(); }
  catch { throw fail(502, 'Bastilla live-chat API returned invalid JSON'); }
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16000) throw fail(413, 'Request is too large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw fail(400, 'Invalid JSON body'); }
}

async function completion(payload, res) {
  const agent = payload?.model;
  if (!AGENTS.includes(agent)) throw fail(400, 'Model must be Aria, Alex, Astyria or Aurelius');
  if (payload.stream === true) throw fail(400, 'Streaming is not supported; configure LibreChat dropParams: [stream]');
  if (!Array.isArray(payload.messages)) throw fail(400, 'messages must be an array');
  if (payload.tools || payload.functions || payload.response_format?.type === 'json_schema') {
    throw fail(400, 'Tools and structured outputs are not supported by this bridge');
  }
  const lastUser = [...payload.messages].reverse().find(m => m?.role === 'user');
  const text = lastUser?.content;
  if (typeof text !== 'string' || text.trim().length < 1 || text.length > 8000) {
    throw fail(400, 'A plain-text user message (1-8000 characters) is required');
  }
  if (active >= 4) throw fail(429, 'Bridge is busy; try again shortly');
  active++;
  try {
    const status = await bastilla('/status');
    if (status?.agents?.[agent]?.status !== 'online') {
      throw fail(503, 'Original ' + agent + ' worker is offline; no fallback or fake response');
    }
    const sent = await bastilla('/messages', 'POST', { channel: agent, text: text.trim() });
    const conversationId = sent?.event?.conversationId;
    if (!conversationId || !sent?.queuedFor?.includes(agent)) {
      throw fail(502, 'Message was not confirmed as queued for the original agent');
    }
    const deadline = Date.now() + WAIT_MS;
    while (Date.now() < deadline && !res.destroyed) {
      const history = await bastilla('/history?channel=' + encodeURIComponent(agent));
      const message = (history?.messages || []).find(m =>
        m?.conversationId === conversationId && m?.sender === agent &&
        m?.type === 'message' && typeof m?.text === 'string' && m.text.trim()
      );
      if (message) {
        return {
          id: 'chatcmpl-' + randomUUID(),
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: agent,
          choices: [{ index: 0, message: { role: 'assistant', content: message.text }, finish_reason: 'stop' }],
        };
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    throw fail(504, 'Agent response timed out; the queued task may still finish in Bastilla LIVE chat');
  } finally { active--; }
}

validateConfig();
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (req.method === 'GET' && pathname === '/healthz') {
      return reply(res, 200, { bridge: 'ready', workers: 'not checked' });
    }
    if (!secureEqual((req.headers.authorization || '').replace(/^Bearer\s+/i, ''), API_KEY)) {
      return reply(res, 401, { error: { message: 'Unauthorized', type: 'authentication_error' } });
    }
    if (req.method === 'GET' && pathname === '/v1/models') {
      return reply(res, 200, { object: 'list', data: AGENTS.map(id => ({ id, object: 'model', owned_by: 'bastilla' })) });
    }
    if (req.method === 'POST' && pathname === '/v1/chat/completions') {
      const result = await completion(await readJson(req), res);
      return reply(res, 200, result);
    }
    return reply(res, 404, { error: { message: 'Not found', type: 'not_found' } });
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 502;
    return reply(res, status, { error: { message: error?.status ? error.message : 'Bastilla bridge upstream error', type: 'bridge_error' } });
  }
});
server.requestTimeout = 15000;
server.listen(PORT, '0.0.0.0', () => console.log('Bastilla LibreChat bridge listening on internal port ' + PORT));
