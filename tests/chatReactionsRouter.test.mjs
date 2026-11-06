import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createChatReactionsRouter } from '../integrations/reactions/router.mjs';
import { ChatReactionStore } from '../integrations/reactions/store.mjs';
import { chatReactionKeys, liveReactionKey } from '../src/lib/chatReactionKeys.mjs';

test('real reaction endpoints reject impersonation, support workers/live events and persist votes', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'bastilla-reaction-router-'));
  const persistentFile = path.join(folder, 'reactions.json');
  const store = new ChatReactionStore(persistentFile);
  const history = [{ agent: 'Alex', tekst: 'Analiza gotowa' }, { agent: 'Operator', tekst: 'Dzięki' }];
  const live = [{ id: '12345678-1234-1234-1234-123456789abc', type: 'message', sender: 'Astyria', text: 'Hej', channel: 'Wszyscy' }];
  const kernelKey = chatReactionKeys(history)[0];
  const liveKey = liveReactionKey(live[0]);
  let published = 0;
  let origin = '';
  const app = express();
  app.use(express.json());
  app.use('/api/chat/reactions', createChatReactionsRouter({
    store,
    getHistory: () => history,
    getLiveHistory: () => live,
    sameOrigin: req => req.get('origin') === origin && req.get('sec-fetch-site') === 'same-origin',
    requireWorker: (req, res, next) => {
      const who = { 'secret-Alex': 'Alex', 'secret-Aria': 'Aria' }[req.get('authorization')?.replace(/^Bearer /, '')];
      if (!who) return res.status(401).json({ error: 'Unauthorized worker' });
      req.agentIdentity = who;
      next();
    },
    notify: () => { published += 1; },
  }));
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    origin = 'http://127.0.0.1:' + server.address().port;
    const endpoint = origin + '/api/chat/reactions';
    const post = (route, payload, headers = {}) => fetch(endpoint + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload),
    });
    const allowed = { Origin: origin, 'Sec-Fetch-Site': 'same-origin' };
    assert.equal((await post('/vote', { messageKey: kernelKey, vote: 'up' })).status, 403,
      'Operator cannot cast a cross-origin vote');
    assert.equal((await post('/worker/vote', { messageKey: kernelKey, vote: 'up' })).status, 401,
      'Unknown worker cannot cast votes');
    assert.equal((await post('/vote', { messageKey: 'm_invalid_0', vote: 'up' }, allowed)).status, 404,
      'Phantom messages are not votable');
    const operator = await post('/vote', { messageKey: kernelKey, vote: 'up', actor: 'Alex' }, allowed);
    assert.equal(operator.status, 200);
    assert.deepEqual((await operator.json()).votes, { Operator: 'up' }, 'Browser input cannot impersonate AI');
    const worker = await post('/worker/vote', { messageKey: kernelKey, vote: 'down', actor: 'Aria' },
      { Authorization: 'Bearer secret-Alex' });
    assert.equal(worker.status, 200);
    assert.deepEqual((await worker.json()).votes, { Operator: 'up', Alex: 'down' },
      'Worker identity derives from verified bearer token');
    const liveVote = await post('/worker/vote', { messageKey: liveKey, vote: 'up' },
      { Authorization: 'Bearer secret-Aria' });
    assert.equal(liveVote.status, 200);
    assert.deepEqual((await liveVote.json()).votes, { Aria: 'up' });
    const workerMessages = await fetch(endpoint + '/worker/messages',
      { headers: { Authorization: 'Bearer secret-Alex' } });
    const workerPayload = await workerMessages.json();
    assert.equal(workerMessages.status, 200);
    assert.ok(workerPayload.messages.some(x => x.messageKey === liveKey && x.kind === 'live'));
    assert.ok(workerPayload.messages.some(x => x.messageKey === kernelKey && x.kind === 'kernel'));
    assert.deepEqual(new ChatReactionStore(persistentFile).get(liveKey), { Aria: 'up' },
      'LIVE votes survive restart');
    const list = await (await fetch(endpoint)).json();
    assert.deepEqual(list.reactions[kernelKey], { Operator: 'up', Alex: 'down' });
    const deniedClear = await fetch(endpoint, { method: 'DELETE' });
    assert.equal(deniedClear.status, 403);
    const cleared = await fetch(endpoint, { method: 'DELETE', headers: allowed });
    assert.equal(cleared.status, 200);
    assert.deepEqual(new ChatReactionStore(persistentFile).list(), {});
    assert.equal(published, 4);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
