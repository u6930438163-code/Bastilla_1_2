#!/usr/bin/env node
// Read-only deployment preflight. Never prints tokens, passwords or stored memory.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const file = process.env.BASTILLA_LIBRECHAT_ENV_FILE ||
  join(root, 'integrations/librechat/.env.local');
const local = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
const config = { ...local, ...process.env };
const live = process.argv.includes('--live');
if (process.argv.includes('--help')) {
  console.log('Usage: node scripts/check-librechat.mjs [--live]');
  console.log('Reads private integrations/librechat/.env.local (or BASTILLA_LIBRECHAT_ENV_FILE).');
  console.log('--live checks Bastilla LIVE login and the four real worker heartbeats.');
  process.exit(0);
}

const issues = [];
const required = [
  'BASTILLA_API_BASE_URL',
  'BASTILLA_LIVE_CHAT_ALLOWED_ORIGIN',
  'BASTILLA_LIVE_CHAT_USER_PASSWORD',
  'BASTILLA_BRIDGE_API_KEY',
  'BASTILLA_LIBRECHAT_OWNER_EMAIL',
];
for (const key of required) {
  if (!config[key]?.trim()) issues.push(key + ': not configured');
}
if (config.BASTILLA_LIVE_CHAT_USER_PASSWORD &&
    config.BASTILLA_LIVE_CHAT_USER_PASSWORD.length < 16) {
  issues.push('BASTILLA_LIVE_CHAT_USER_PASSWORD: must have at least 16 characters');
}
if (config.BASTILLA_BRIDGE_API_KEY &&
    Buffer.byteLength(config.BASTILLA_BRIDGE_API_KEY) < 32) {
  issues.push('BASTILLA_BRIDGE_API_KEY: must have at least 32 bytes');
}
if (config.BASTILLA_LIBRECHAT_OWNER_EMAIL &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.BASTILLA_LIBRECHAT_OWNER_EMAIL.trim())) {
  issues.push('BASTILLA_LIBRECHAT_OWNER_EMAIL: invalid account email');
}
function validateOrigin(key, dockerHost) {
  if (!config[key]) return;
  try {
    const url = new URL(config[key]);
    const localHosts = dockerHost
      ? ['localhost', '127.0.0.1', '[::1]', 'host.docker.internal']
      : ['localhost', '127.0.0.1', '[::1]'];
    const validTransport = url.protocol === 'https:' ||
      (url.protocol === 'http:' && localHosts.includes(url.hostname));
    if (!validTransport || url.username || url.password || url.pathname !== '/' ||
        url.search || url.hash) throw new Error('invalid');
  } catch {
    issues.push(key + ': requires an HTTPS origin (or a permitted local HTTP origin)');
  }
}
validateOrigin('BASTILLA_API_BASE_URL', true);
validateOrigin('BASTILLA_LIVE_CHAT_ALLOWED_ORIGIN', false);

if (issues.length) {
  console.error('LibreChat preflight: NOT READY');
  for (const issue of issues) console.error(' - ' + issue);
  console.error('Set values privately; do not commit .env.local or share its contents.');
  process.exit(2);
}
console.log('LibreChat preflight: configuration valid (not proof of a running service).');
if (!live) {
  console.log('For a live worker heartbeat check: npm run check:librechat -- --live');
  process.exit(0);
}

const base = config.BASTILLA_API_BASE_URL.replace(/\/+$/, '');
const headers = { Origin: config.BASTILLA_LIVE_CHAT_ALLOWED_ORIGIN };
try {
  const login = await fetch(base + '/api/live-chat/session', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: config.BASTILLA_LIVE_CHAT_USER_PASSWORD }),
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!login.ok) throw new Error('Bastilla login returned HTTP ' + login.status);
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie.startsWith('bastilla_live_chat_session=')) {
    throw new Error('Bastilla login did not return the operator session');
  }
  const res = await fetch(base + '/api/live-chat/status', {
    headers: { ...headers, Cookie: cookie },
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!res.ok) throw new Error('Bastilla status returned HTTP ' + res.status);
  const status = await res.json();
  const agents = ['Aria', 'Alex', 'Astyria', 'Aurelius'];
  const online = agents.filter(agent => status?.agents?.[agent]?.status === 'online');
  for (const agent of agents) {
    console.log(agent + ': ' + (online.includes(agent) ? 'heartbeat online' : 'offline / unverified'));
  }
  console.log('Online heartbeats: ' + online.length + '/4.');
  console.log('A heartbeat is NOT proof of a real model response. Test messages end-to-end.');
  if (online.length !== 4) process.exitCode = 1;
} catch (error) {
  // Never log request headers, credentials, memory or an upstream response body.
  const safeMessage = error.message.startsWith('Bastilla ')
    ? error.message : 'Unable to contact Bastilla from this host (check Docker network and URL).';
  console.error('LibreChat live check failed: ' + safeMessage);
  process.exitCode = 1;
}
