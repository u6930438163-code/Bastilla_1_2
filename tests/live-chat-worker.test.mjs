import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createLiveChatRouter } from '../integrations/live-chat/router.mjs';
import { createLiveChatWorkerAuth } from '../integrations/live-chat/auth.mjs';
import { LiveChatStore } from '../integrations/live-chat/store.mjs';
import { createAgentWorker } from '../integrations/live-chat/worker-client.mjs';

test('worker client delegates to the supplied original-agent adapter and routes an agent-to-agent reply', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bastilla-live-worker-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const app = express();
  app.use(express.json());
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const tokens = {
    Aria: 'a'.repeat(40),
    Alex: 'b'.repeat(40),
    Astyria: 'c'.repeat(40),
    Aurelius: 'd'.repeat(40),
  };
  const store = new LiveChatStore({ filePath: path.join(directory, 'state.json') });
  app.use('/api/live-chat', createLiveChatRouter({
    store,
    requireUser: (_req, _res, next) => next(),
    requireWorker: createLiveChatWorkerAuth({ tokens }),
    session: { login: (_req, res) => res.sendStatus(501), session: (_req, res) => res.json({}), logout: (_req, res) => res.json({}) },
  }));

  await store.createUserMessage({ channel: 'Alex', text: 'Sprawdź zadanie', recipients: ['Alex'] });
  let receivedJob = null;
  const worker = createAgentWorker({
    baseUrl: 'http://127.0.0.1:' + server.address().port,
    agent: 'Alex',
    token: tokens.Alex,
    pollIntervalMs: 500,
    runAgent: async (job) => {
      receivedJob = job;
      return { text: 'Wynik z adaptera agenta Alex', to: 'Aria' };
    },
    onIdle: async ({ sendMessage }) => {
      await sendMessage('Autonomiczny komunikat Alexa');
    },
  });

  assert.equal(await worker.pollOnce(), true);
  assert.equal(receivedJob.to, 'Alex');
  const responseEvent = await worker.sendMessage('Samodzielny status Alexa', { channel: 'Wszyscy', to: 'Aurelius' });
  assert.equal(responseEvent.sender, 'Alex');
  assert.equal(await worker.runIdleOnce(), true);
  assert.equal(store.getHistory('Wszyscy').length, 4);
  const ariaJob = await store.claimNext('Aria', 'aria-worker');
  assert.equal(ariaJob.from, 'Alex');
  assert.equal(ariaJob.text, 'Wynik z adaptera agenta Alex');
  const aureliusJob = await store.claimNext('Aurelius', 'aurelius-worker');
  assert.equal(aureliusJob.from, 'Alex');
  assert.equal(aureliusJob.text, 'Samodzielny status Alexa');
});
