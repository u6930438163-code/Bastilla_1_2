import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { createWorkspaceSyncHub } from '../integrations/workspace-sync/hub.mjs';

test('workspace SSE requires operator access and replays metadata-only changes', { timeout: 8000 }, async () => {
  const app = express();
  const requireUser = (req, res, next) => {
    if (req.get('X-Test-Operator') !== 'allowed') {
      return res.status(401).json({ error: 'unauthorized' });
    }
    next();
  };
  const hub = createWorkspaceSyncHub(requireUser);
  app.use('/api/workspace', hub.router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const controller = new AbortController();

  try {
    const denied = await fetch(origin + '/api/workspace/status');
    assert.equal(denied.status, 401);
    const deniedStream = await fetch(origin + '/api/workspace/events?after=0');
    assert.equal(deniedStream.status, 401);

    const headers = { 'X-Test-Operator': 'allowed' };
    const initial = await fetch(origin + '/api/workspace/status', { headers });
    assert.equal(initial.status, 200);
    assert.equal((await initial.json()).revision, 0);

    assert.throws(() => hub.publish('untrusted-topic'), /Invalid workspace sync topic/);
    const change = hub.publish('terminal', 'do-not-send-terminal-output');
    assert.equal(change.id, '1');
    assert.deepEqual(Object.keys(change).sort(), ['at', 'id', 'topic']);

    const current = await fetch(origin + '/api/workspace/status', { headers });
    assert.equal((await current.json()).revision, 1);

    const stream = await fetch(origin + '/api/workspace/events?after=0', {
      headers,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]),
    });
    assert.equal(stream.status, 200);
    assert.match(stream.headers.get('content-type') || '', /text\/event-stream/);

    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    let received = '';
    while (!received.includes('"topic":"terminal"')) {
      const { done, value } = await reader.read();
      if (done) throw new Error('Workspace event stream closed before replay');
      received += decoder.decode(value, { stream: true });
    }
    assert.match(received, /event: change/);
    assert.match(received, /id: 1/);
    assert.doesNotMatch(received, /do-not-send-terminal-output/);
    controller.abort();
    await reader.cancel().catch(() => {});
  } finally {
    controller.abort();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
