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
        taskAttempt: job.attempts,
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
    assert.equal((await alexClaim.json()).job.from, 'user');
    const alexAgentClaim = await fetch(origin + '/api/live-chat/worker/next', {
      method: 'POST', headers: alexHeaders, body: '{}',
    });
    assert.equal((await alexAgentClaim.json()).job.from, 'Aria');

    const history = await fetch(origin + '/api/live-chat/history?channel=Wszyscy', {
      headers: { Cookie: cookie },
    });
    assert.equal(history.status, 200);
    assert.equal((await history.json()).messages.length, 2);
    assert.equal(store.getStatus().agents.Aria.status, 'online');
  });
});

test('first run allows only the owner with a server-side setup token to set a persistent password', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bastilla-live-setup-'));
  const credentialsPath = path.join(directory, 'credentials.json');
  const store = new LiveChatStore({ filePath: path.join(directory, 'state.json') });
  const token = 'owner-activation-token-' + 'z'.repeat(40);
  const password = 'long newly chosen password!';
  const app = express();
  app.use(express.json());
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const config = { password: '', secret: 's'.repeat(48), allowedOrigin: origin, cookieSecure: false, setupToken: token, credentialsPath };
  const session = createLiveChatSessionAuth(config);
  const workerAuth = createLiveChatWorkerAuth({ tokens: {
    Aria: 'a'.repeat(40), Alex: 'b'.repeat(40), Astyria: 'c'.repeat(40), Aurelius: 'd'.repeat(40),
  } });
  app.use('/api/live-chat', createLiveChatRouter({
    store, requireUser: session.requireUser, requireWorker: workerAuth, session,
  }));
  const url = origin + '/api/live-chat';
  const request = (target, data, sentOrigin = origin) => fetch(url + target, {
    method: 'POST', headers: { Origin: sentOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  try {
    const status = await fetch(url + '/setup');
    assert.deepEqual(await status.json(), { setupRequired: true, serverConfigured: true });
    assert.equal((await fetch(url + '/session')).status, 503);
    assert.equal((await request('/setup', { token, password }, 'http://attacker.example')).status, 403);
    assert.equal((await request('/setup', { token: 'invalid', password })).status, 401);
    assert.equal((await request('/setup', { token, password: 'weak' })).status, 400);
    assert.equal(fs.existsSync(credentialsPath), false);

    const setup = await request('/setup', { token, password });
    assert.equal(setup.status, 201);
    assert.equal((await setup.json()).authenticated, true);
    const cookie = setup.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(url + '/session', { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await (await fetch(url + '/setup')).json()).setupRequired, false);
    assert.equal((await request('/setup', { token, password })).status, 409);
    assert.equal((await request('/session', { password: 'incorrect password' })).status, 401);
    assert.equal((await request('/session', { password })).status, 200);
    assert.equal(fs.readFileSync(credentialsPath, 'utf8').includes(password), false);
    assert.equal(fs.statSync(credentialsPath).mode & 0o077, 0);

    const restarted = createLiveChatSessionAuth(config);
    assert.equal(restarted.configured, true);
    assert.equal((await request('/session', { password })).status, 200);
    // Persisted credentials must work when the HTTP handler is recreated.
    // A restarted authentication object must still accept the password.
    const restartedResponse = {
      setHeader() {}, status(code) { this.code = code; return this; },
      json(value) { this.body = value; return this; },
    };
    restarted.login({
      body: { password }, ip: '127.0.0.1',
      get(name) { return name === 'Origin' ? origin : ''; },
    }, restartedResponse);
    assert.equal(restartedResponse.body.authenticated, true);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('existing configured operator password disables enrollment even with a setup token', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bastilla-legacy-setup-'));
  try {
    const auth = createLiveChatSessionAuth({
      password: 'legacy-password-12345', secret: 's'.repeat(48),
      allowedOrigin: 'https://bastilla.example', setupToken: 'k'.repeat(48),
      credentialsPath: path.join(dir, 'credential.json'),
    });
    assert.equal(auth.configured, true);
    const response = { setHeader() {}, json(value) { this.body = value; return this; } };
    auth.setupStatus({}, response);
    assert.deepEqual(response.body, { setupRequired: false, serverConfigured: true });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
