import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LiveChatStore, LIVE_CHAT_AGENTS } from '../integrations/live-chat/store.mjs';

test('persists the conversation and routes work between original agent identities', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bastilla-live-chat-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'state.json');
  const first = new LiveChatStore({ filePath });

  const sent = await first.createUserMessage({
    channel: 'Wszyscy',
    text: 'Sprawdź gotowość systemu',
    recipients: LIVE_CHAT_AGENTS,
  });
  assert.equal(sent.jobs.length, 4);

  const restarted = new LiveChatStore({ filePath });
  assert.equal(restarted.getHistory('Wszyscy').length, 1);

  const ariaJob = await restarted.claimNext('Aria', 'aria-worker');
  assert.equal(ariaJob.to, 'Aria');
  const ariaReply = await restarted.createAgentEvent({
    agent: 'Aria',
    channel: 'Wszyscy',
    type: 'message',
    text: 'Przekazuję analizę do Alexa',
    taskId: ariaJob.id,
    to: 'Alex',
  });
  assert.equal(ariaReply.jobs.length, 1);
  assert.equal(ariaReply.jobs[0].to, 'Alex');

  const alexBroadcastJob = await restarted.claimNext('Alex', 'alex-worker');
  assert.equal(alexBroadcastJob.from, 'user');
  const alexJob = await restarted.claimNext('Alex', 'alex-worker');
  assert.equal(alexJob.from, 'Aria');
  const alexReply = await restarted.createAgentEvent({
    agent: 'Alex',
    channel: 'Wszyscy',
    type: 'message',
    text: 'Analiza zakończona',
    taskId: alexJob.id,
  });
  assert.equal(alexReply.jobs.length, 0);
  assert.equal(restarted.getHistory('Wszyscy').length, 3);
});

test('reclaims an expired worker lease and reports only recent heartbeats as online', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bastilla-live-chat-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let now = 1_800_000_000_000;
  const store = new LiveChatStore({ filePath: path.join(directory, 'state.json'), now: () => now });
  await store.createUserMessage({ channel: 'Aria', text: 'Zadanie', recipients: ['Aria'] });

  const first = await store.claimNext('Aria', 'worker-one', 10000);
  assert.equal(first.attempts, 1);
  now += 11000;
  const reclaimed = await store.claimNext('Aria', 'worker-two', 10000);
  assert.equal(reclaimed.attempts, 2);
  await store.heartbeat('Aria', 'worker-two');
  assert.equal(store.getStatus().agents.Aria.status, 'online');

  now += 60000;
  assert.equal(store.getStatus().agents.Aria.status, 'offline');
});

test('marks a failed job for retry and persists read state', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bastilla-live-chat-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'state.json');
  const store = new LiveChatStore({ filePath });
  const sent = await store.createUserMessage({ channel: 'Alex', text: 'Test', recipients: ['Alex'] });
  const job = await store.claimNext('Alex', 'alex-worker');
  const failed = await store.failJob({ id: job.id, agent: 'Alex', error: 'temporary provider outage' });
  assert.equal(failed.status, 'queued');
  await store.markRead(sent.event.id);
  const restarted = new LiveChatStore({ filePath });
  assert.equal(restarted.getHistory('Alex')[0].read, true);
});
