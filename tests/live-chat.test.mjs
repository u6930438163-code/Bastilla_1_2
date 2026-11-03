import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createLiveChatRouter } from '../integrations/live-chat/router.mjs';
import { createLiveChatSessionAuth, createLiveChatWorkerAuth } from '../integrations/live-chat/auth.mjs';
import { LiveChatStore } from '../integrations/live-chat/store.mjs';

async function withServer(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bastilla-live-chat-'));
  const app = express();
  app.use(express.json());
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const tokens = {
    Aria: 'a'.repeat(40),
    Alex: 'b'.repeat(40),
    Astyria: 'c'.repeat(40),
    Aurelius: 'd'.repeat(40),
  };
  const session = createLiveChatSessionAuth({
    password: 'correct horse battery staple',
    secret: 's'.repeat(48),
    allowedOrigin: origin,
    cookieSecure: false,
  });
  const workerAuth = createLiveChatWorkerAuth({ tokens });
  const store = new LiveChatStore({ filePath: path.join(directory, 'state.json') });
  app.use('/api/live-chat', createLiveChatRouter({
    store,
    requireUser: session.requireUser,
    requireWorker: workerAuth,
    session,
  }));
  try {
    await run({ origin, tokens, store });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('requires an authenticated user and unique worker identity for live chat', async () => {
  await withServer(async ({ origin, tokens, store }) => {
    const unauthenticated = await fetch(origin + '/api/live-chat/history');
    assert.equal(unauthenticated.status, 401);

    const wrongPassword = await fetch(origin + '/api/live-chat/session', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'incorrect password' }),
    });
    assert.equal(wrongPassword.status, 401);

    const login = await fetch(origin + '/api/live-chat/session', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery staple' }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const userHeaders = { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' };

    const sent = await fetch(origin + '/api/live-chat/messages', {
      method: 'POST',
      headers: userHeaders,
      body: JSON.stringify({ channel: 'Wszyscy', text: 'Wiadomość operatora' }),
    });
    assert.equal(sent.status, 202);
    const sentData = await sent.json();
    assert.equal(sentData.queuedFor.length, 4);

    const noToken = await fetch(origin + '/api/live-chat/worker/next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(noToken.status, 401);

    const ariaHeaders = {
      Authorization: 'Bearer ' + tokens.Aria,
      'X-Worker-Id': 'aria-test-worker',
      'Content-Type': 'application/json',
    };
    const heartbeat = await fetch(origin + '/api/live-chat/worker/heartbeat', {
      method: 'POST', headers: ariaHeaders, body: '{}',
    });
    assert.equal(heartbeat.status, 200);

    const claim = await fetch(origin + '/api/live-chat/worker/next', {
      method: 'POST', headers: ariaHeaders, body: '{}',
    });
    const job = (await claim.json()).job;
    assert.equal(job.to, 'Aria');

    const reply = await fetch(origin + '/api/live-chat/worker/events', {
      method: 'POST',
      headers: ariaHeaders,
      body: JSON.stringify({
        channel: 'Wszyscy',
        type: 'message',
        text: 'Odpowiedź Aria',
        taskId: job.id,
        to: 'Alex',
        sender: 'Aurelius',
      }),
    });
    assert.equal(reply.status, 202);
    assert.equal((await reply.json()).event.sender, 'Aria');

    const alexHeaders = {
      Authorization: 'Bearer ' + tokens.Alex,
      'X-Worker-Id': 'alex-test-worker',
      'Content-Type': 'application/json',
    };
    const alexClaim = await fetch(origin + '/api/live-chat/worker/next', {
      method: 'POST', headers: alexHeaders, body: '{}',
    });
    assert.equal((await alexClaim.json()).job.from, 'Aria');

    const history = await fetch(origin + '/api/live-chat/history?channel=Wszyscy', {
      headers: { Cookie: cookie },
    });
    assert.equal(history.status, 200);
    assert.equal((await history.json()).messages.length, 2);
    assert.equal(store.getStatus().agents.Aria.status, 'online');
  });
});
