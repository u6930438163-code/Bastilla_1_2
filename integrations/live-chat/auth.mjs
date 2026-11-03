import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const AGENTS = ['Aria', 'Alex', 'Astyria', 'Aurelius'];
const COOKIE_NAME = 'bastilla_live_chat_session';
const COOKIE_PATH = '/api';

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

function readCookie(req, name) {
  const header = req.get('Cookie') || '';
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return '';
}

export function createLiveChatSessionAuth(options = {}) {
  const password = String(options.password || '');
  const secret = String(options.secret || '');
  const allowedOriginInput = String(options.allowedOrigin || '');
  const ttlSeconds = Math.max(900, Math.min(604800, Number(options.ttlSeconds) || 43200));
  const cookieSecure = options.cookieSecure !== false;
  let allowedOrigin = '';

  try {
    const parsed = new URL(allowedOriginInput);
    const localHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.protocol === 'https:' || localHttp) allowedOrigin = parsed.origin;
  } catch {
    allowedOrigin = '';
  }

  const configured = password.length >= 16 && Buffer.byteLength(secret) >= 32 && Boolean(allowedOrigin);
  const sign = (payload) => createHmac('sha256', secret).update(payload).digest('base64url');
  const originAllowed = (req) => Boolean(allowedOrigin) && req.get('Origin') === allowedOrigin;
  const setCookie = (res, value, maxAge) => {
    const secure = cookieSecure ? '; Secure' : '';
    res.setHeader('Set-Cookie', COOKIE_NAME + '=' + value + '; Path=' + COOKIE_PATH +
      '; HttpOnly; SameSite=Strict; Max-Age=' + maxAge + secure);
    res.setHeader('Cache-Control', 'no-store');
  };

  function requireUser(req, res, next) {
    if (!configured) return res.status(503).json({ error: 'Live chat user authentication is not configured' });
    const token = readCookie(req, COOKIE_NAME);
    const parts = token.split('.');
    if (parts.length !== 3) return res.status(401).json({ error: 'Login required' });
    const expiresAt = Number(parts[0]);
    if (!Number.isSafeInteger(expiresAt) || expiresAt * 1000 <= Date.now() || !parts[1]) {
      return res.status(401).json({ error: 'Session expired' });
    }
    if (!safeEqual(parts[2], sign(parts[0] + '.' + parts[1]))) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !originAllowed(req)) {
      return res.status(403).json({ error: 'Cross-origin request rejected' });
    }
    req.liveChatExpiresAt = expiresAt;
    next();
  }

  function login(req, res) {
    if (!configured) return res.status(503).json({ error: 'Set the live chat origin, user password and session secret on the server' });
    if (!originAllowed(req)) return res.status(403).json({ error: 'Origin is not allowed' });
    const supplied = typeof req.body?.password === 'string' ? req.body.password : '';
    if (supplied.length > 512 || !safeEqual(supplied, password)) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const payload = expiresAt + '.' + randomBytes(18).toString('base64url');
    const token = payload + '.' + sign(payload);
    setCookie(res, encodeURIComponent(token), ttlSeconds);
    return res.json({ authenticated: true, expiresAt });
  }

  function logout(req, res) {
    if (!originAllowed(req)) return res.status(403).json({ error: 'Origin is not allowed' });
    setCookie(res, '', 0);
    return res.json({ authenticated: false });
  }

  function session(req, res) {
    return res.json({ authenticated: true, expiresAt: req.liveChatExpiresAt || null });
  }

  return { configured, requireUser, login, logout, session };
}

export function createLiveChatWorkerAuth(options = {}) {
  let credentials = options.tokens && typeof options.tokens === 'object' ? options.tokens : null;
  if (!credentials) {
    try {
      credentials = JSON.parse(String(options.tokensJson || '{}'));
    } catch {
      credentials = null;
    }
  }
  const uniqueTokens = credentials && AGENTS.every((agent) =>
    typeof credentials[agent] === 'string' &&
    Buffer.byteLength(credentials[agent]) >= 32 &&
    !/^(REPLACE|CHANGE|YOUR|MY)_/i.test(credentials[agent])
  ) && new Set(AGENTS.map((agent) => credentials[agent])).size === AGENTS.length;
  const configured = Boolean(uniqueTokens);

  return function requireWorker(req, res, next) {
    if (!configured) return res.status(503).json({ error: 'Four unique worker tokens are not configured' });
    const header = req.get('Authorization') || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    const supplied = match ? match[1] : '';
    let identity = null;
    for (const agent of AGENTS) {
      if (safeEqual(supplied, credentials[agent])) identity = agent;
    }
    if (!identity) return res.status(401).json({ error: 'Unauthorized worker' });
    req.agentIdentity = identity;
    next();
  };
}
