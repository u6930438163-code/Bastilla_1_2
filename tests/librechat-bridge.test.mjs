import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}
function close(server) {
  return new Promise(resolve => server.close(resolve));
}
function json(res, data, status = 200, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(data));
}
async function waitForHealth(url, processHandle) {
  for (let i = 0; i < 40; i++) {
    if (processHandle.exitCode !== null) throw new Error('Bridge exited before healthy');
    try { const response = await fetch(url + '/healthz'); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Bridge did not start');
}

test('LibreChat bridge uses only existing authenticated Bastilla worker responses', async t => {
  const key = 'k'.repeat(48);
  let originalOnline = true;
  let queued = false;
  const backend = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (req.method === 'POST' && url.pathname === '/api/live-chat/session') {
      assert.equal(req.headers.origin, 'http://localhost:3000');
      const chunks = [];
      for await (const part of req) chunks.push(part);
      assert.equal(JSON.parse(Buffer.concat(chunks).toString()).password, 'operator-password-123');
      return json(res, { authenticated: true }, 200, {
        'Set-Cookie': 'bastilla_live_chat_session=mock-value; Path=/api; HttpOnly; SameSite=Strict',
      });
    }
    if (req.headers.cookie !== 'bastilla_live_chat_session=mock-value') return json(res, { error: 'missing session' }, 401);
    if (url.pathname === '/api/live-chat/status' && req.method === 'GET') {
      return json(res, { agents: { Aria: { status: originalOnline ? 'online' : 'offline' } } });
    }
    if (url.pathname === '/api/live-chat/messages' && req.method === 'POST') {
      assert.equal(req.headers.origin, 'http://localhost:3000');
      const parts = [];
      for await (const part of req) parts.push(part);
      const body = JSON.parse(Buffer.concat(parts).toString());
      assert.deepEqual(body, { channel: 'Aria', text: 'Hello original Aria' });
      queued = true;
      return json(res, { event: { conversationId: 'test-conversation' }, queuedFor: ['Aria'] }, 202);
    }
    if (url.pathname === '/api/live-chat/history' && req.method === 'GET') {
      return json(res, { messages: queued
        ? [{ conversationId: 'test-conversation', sender: 'Aria', type: 'message', text: 'Real worker response from test backend' }]
        : [] });
    }
    return json(res, { error: 'not found' }, 404);
  });
  const backendPort = await listen(backend);
  t.after(() => close(backend));

  const probe = http.createServer((_req, res) => res.end());
  const bridgePort = await listen(probe);
  await close(probe);

  const child = spawn(process.execPath, ['integrations/librechat/bridge/server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(bridgePort),
      BASTILLA_BRIDGE_API_KEY: key,
      BASTILLA_LIVE_CHAT_USER_PASSWORD: 'operator-password-123',
      BASTILLA_LIVE_CHAT_ALLOWED_ORIGIN: 'http://localhost:3000',
      BASTILLA_API_BASE_URL: 'http://127.0.0.1:' + backendPort,
    },
    stdio: 'ignore',
  });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  const base = 'http://127.0.0.1:' + bridgePort;
  await waitForHealth(base, child);

  const unauth = await fetch(base + '/v1/models');
  assert.equal(unauth.status, 401);
  const headers = { Authorization: 'Bearer ' + key };
  const models = await fetch(base + '/v1/models', { headers });
  assert.equal(models.status, 200);
  assert.deepEqual((await models.json()).data.map(model => model.id), ['Aria', 'Alex', 'Astyria', 'Aurelius']);

  const options = {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'Aria', messages: [{ role: 'user', content: 'Hello original Aria' }] }),
  };
  const response = await fetch(base + '/v1/chat/completions', options);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.model, 'Aria');
  assert.equal(result.choices[0].message.content, 'Real worker response from test backend');
  assert.equal(queued, true);

  const streamed = await fetch(base + '/v1/chat/completions', {
    ...options,
    body: JSON.stringify({ model: 'Aria', stream: true, messages: [{ role: 'user', content: 'Hello original Aria' }] }),
  });
  assert.equal(streamed.status, 200);
  assert.match(streamed.headers.get('content-type') || '', /text\/event-stream/);
  const events = (await streamed.text()).trim().split(/\n\n/)
    .filter(line => line.startsWith('data: ')).map(line => line.slice(6));
  assert.equal(events.at(-1), '[DONE]');
  const firstChunk = JSON.parse(events[0]);
  assert.equal(firstChunk.object, 'chat.completion.chunk');
  assert.equal(firstChunk.model, 'Aria');
  assert.equal(firstChunk.choices[0].delta.content, 'Real worker response from test backend');
  assert.equal(JSON.parse(events[1]).choices[0].finish_reason, 'stop');

  const invalid = await fetch(base + '/v1/chat/completions', {
    ...options, body: JSON.stringify({ model: 'Aria', stream: 'true', messages: [{ role: 'user', content: 'hi' }] }),
  });
  assert.equal(invalid.status, 400);
  const unsupportedTools = await fetch(base + '/v1/chat/completions', {
    ...options, body: JSON.stringify({ model: 'Aria', tools: [{ type: 'function' }],
      messages: [{ role: 'user', content: 'Hello original Aria' }] }),
  });
  assert.equal(unsupportedTools.status, 400);

  originalOnline = false;
  const offline = await fetch(base + '/v1/chat/completions', options);
  assert.equal(offline.status, 503);
  assert.match((await offline.json()).error.message, /offline/);
});
