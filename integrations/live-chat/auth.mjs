import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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
    if (part.slice(0, separator).trim() === name) {
      try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return ''; }
    }
  }
  return '';
}

export function createLiveChatSessionAuth(options = {}) {
  const password = String(options.password || '');
  const secret = String(options.secret || '');
  const setupToken = String(options.setupToken || '');
  const credentialsPath = path.resolve(String(options.credentialsPath || 'data/live-chat-credentials.json'));
  const legacyPasswordConfigured = password.length >= 16;
  const readCredentials = () => {
    try {
      const value = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      if (value.version === 1 && /^[0-9a-f]{32}$/.test(value.salt) && /^[0-9a-f]{64}$/.test(value.hash)) return value;
    } catch { /* Missing or invalid credentials: fail closed. */ }
    return null;
  };
  let storedCredentials = readCredentials();
  const allowedOriginInput = String(options.allowedOrigin || '');
  const ttlSeconds = Math.max(900, Math.min(604800, Number(options.ttlSeconds) || 43200));
  let localHttpOrigin = false;
  let allowedOrigin = '';

  try {
    const parsed = new URL(allowedOriginInput);
    localHttpOrigin = parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    const cleanOrigin = parsed.pathname === '/' && !parsed.search && !parsed.hash;
    if (cleanOrigin && (parsed.protocol === 'https:' || localHttpOrigin)) allowedOrigin = parsed.origin;
  } catch {
    allowedOrigin = '';
  }

  const cookieSecure = !localHttpOrigin || options.cookieSecure !== false;
  const baseConfigured = Buffer.byteLength(secret) >= 32 && Boolean(allowedOrigin);
  const isConfigured = () => baseConfigured && (legacyPasswordConfigured || Boolean(storedCredentials));
  // Enrollment never replaces an existing credential, including a malformed file.
  const enrollmentReady = () => baseConfigured && !legacyPasswordConfigured &&
    !fs.existsSync(credentialsPath) && Buffer.byteLength(setupToken) >= 32;
  const loginAttempts = new Map();
  const setupAttempts = new Map();
  const sign = (payload) => createHmac('sha256', secret).update(payload).digest('base64url');
  const originAllowed = (req) => Boolean(allowedOrigin) && req.get('Origin') === allowedOrigin;
  const setCookie = (res, value, maxAge) => {
    const secure = cookieSecure ? '; Secure' : '';
    res.setHeader('Set-Cookie', COOKIE_NAME + '=' + value + '; Path=' + COOKIE_PATH +
      '; HttpOnly; SameSite=Strict; Max-Age=' + maxAge + secure);
    res.setHeader('Cache-Control', 'no-store');
  };

  const issueSession = (res) => {
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const payload = expiresAt + '.' + randomBytes(18).toString('base64url');
    setCookie(res, encodeURIComponent(payload + '.' + sign(payload)), ttlSeconds);
    return { authenticated: true, expiresAt };
  };

  function requireUser(req, res, next) {
    if (!isConfigured()) return res.status(503).json({ error: 'Live chat user authentication is not configured' });
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
    if (!isConfigured()) return res.status(503).json({ error: 'Live chat operator authentication needs server configuration or owner enrollment' });
    if (!originAllowed(req)) return res.status(403).json({ error: 'Origin is not allowed' });
    const now = Date.now();
    for (const [key, value] of loginAttempts) if (value.resetAt <= now) loginAttempts.delete(key);
    const address = String(req.ip || req.socket?.remoteAddress || 'unknown');
    const attempt = loginAttempts.get(address) || { count: 0, resetAt: now + 900000 };
    if (attempt.resetAt <= now) { attempt.count = 0; attempt.resetAt = now + 900000; }
    if (attempt.count >= 10) return res.status(429).json({ error: 'Too many login attempts; try again later' });
    const supplied = typeof req.body?.password === 'string' ? req.body.password : '';
    const valid = supplied.length <= 512 && (legacyPasswordConfigured
      ? safeEqual(supplied, password)
      : Boolean(storedCredentials) && safeEqual(
          scryptSync(supplied, Buffer.from(storedCredentials.salt, 'hex'), 32).toString('hex'),
          storedCredentials.hash));
    if (!valid) {
      attempt.count += 1;
      loginAttempts.set(address, attempt);
      return res.status(401).json({ error: 'Invalid password' });
    }
    loginAttempts.delete(address);
    return res.json(issueSession(res));
  }

  function setupStatus(_req, res) {
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ setupRequired: enrollmentReady(), serverConfigured: baseConfigured });
  }

  function setup(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (!originAllowed(req)) return res.status(403).json({ error: 'Origin is not allowed' });
    if (isConfigured()) return res.status(409).json({ error: 'Operator account already exists' });
    if (!enrollmentReady()) return res.status(503).json({ error: 'Owner enrollment requires server setup' });

    const now = Date.now();
    for (const [key, value] of setupAttempts) if (value.resetAt <= now) setupAttempts.delete(key);
    const address = String(req.ip || req.socket?.remoteAddress || 'unknown');
    const attempt = setupAttempts.get(address) || { count: 0, resetAt: now + 900000 };
    if (attempt.count >= 5) return res.status(429).json({ error: 'Too many enrollment attempts' });

    const suppliedToken = typeof req.body?.token === 'string' ? req.body.token : '';
    if (suppliedToken.length > 512 || !safeEqual(suppliedToken, setupToken)) {
      attempt.count += 1;
      setupAttempts.set(address, attempt);
      return res.status(401).json({ error: 'Invalid owner setup code' });
    }
    const chosen = typeof req.body?.password === 'string' ? req.body.password : '';
    if (chosen.length < 16 || chosen.length > 512 || safeEqual(chosen, setupToken)) {
      return res.status(400).json({ error: 'Choose a distinct operator password of 16 to 512 characters' });
    }

    const salt = randomBytes(16).toString('hex');
    const record = {
      version: 1,
      salt,
      hash: scryptSync(chosen, Buffer.from(salt, 'hex'), 32).toString('hex'),
    };
    const temporaryPath = credentialsPath + '.' + randomBytes(8).toString('hex') + '.tmp';
    try {
      fs.mkdirSync(path.dirname(credentialsPath), { recursive: true, mode: 0o700 });
      fs.writeFileSync(temporaryPath, JSON.stringify(record) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      // Hard-link publish is atomic and cannot overwrite a concurrent enrollment.
      fs.linkSync(temporaryPath, credentialsPath);
      storedCredentials = record;
      setupAttempts.clear();
      return res.status(201).json(issueSession(res));
    } catch (error) {
      if (error?.code === 'EEXIST') return res.status(409).json({ error: 'Operator account already exists' });
      return res.status(503).json({ error: 'Unable to persist operator credentials on the server' });
    } finally {
      try { fs.unlinkSync(temporaryPath); } catch { /* Best-effort cleanup. */ }
    }
  }

  function logout(req, res) {
    if (!originAllowed(req)) return res.status(403).json({ error: 'Origin is not allowed' });
    setCookie(res, '', 0);
    return res.json({ authenticated: false });
  }

  function session(req, res) {
    return res.json({ authenticated: true, expiresAt: req.liveChatExpiresAt || null });
  }

  return { get configured() { return isConfigured(); }, requireUser, login, logout, session, setup, setupStatus };
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
