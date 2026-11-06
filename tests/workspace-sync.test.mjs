import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { createWorkspaceSyncHub } from '../integrations/workspace-sync/hub.mjs';

test('workspace sync only streams metadata to authenticated operators', async t => {
  const app = express();
  const hub = createWorkspaceSyncHub((req, res, next) => {
    if (req.headers.authorization !== 'Bearer test-operator') return res.status(401).json({ error: 'Login required' });
    next();
  });
  app.use('/api/workspace', hub.router);
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = 'http://127.0.0.1:' + server.address().port + '/api/workspace';
  const denied = await fetch(base + '/events');
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get('content-type')?.includes('text/event-stream'), false);
  const allowed = await fetch(base + '/status', { headers: { Authorization: 'Bearer test-operator' } });
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).mode, 'live');

  const controller = new AbortController();
  t.after(() => controller.abort());
  const sse = await fetch(base + '/events', {
    headers: { Authorization: 'Bearer test-operator' },
    signal: controller.signal,
  });
  assert.equal(sse.status, 200);
  assert.match(sse.headers.get('content-type') || '', /text\/event-stream/);
  const reader = sse.body.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /connected/);
  const event = hub.publish('terminal');
  assert.equal(event.topic, 'terminal');
  assert.equal(Object.keys(event).sort().join(','), 'at,id,topic');
  let output = '';
  const decoder = new TextDecoder();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    while (!output.includes('"topic":"terminal"')) {
      const { done, value } = await reader.read();
      if (done) throw new Error('SSE closed before terminal notification');
      output += decoder.decode(value, { stream: true });
    }
  } finally {
    clearTimeout(timeout);
  }
  assert.match(output, /event: change/);
  assert.match(output, /"topic":"terminal"/);
  assert.doesNotMatch(output, /password|command|output|secret/i);
  controller.abort();
});

test('workspace sync rejects unknown event topics instead of exposing data', () => {
  const hub = createWorkspaceSyncHub((_req, _res, next) => next());
  assert.throws(() => hub.publish('credential'), /Invalid workspace sync topic/);
  assert.equal(hub.publish('chat').topic, 'chat');
});
