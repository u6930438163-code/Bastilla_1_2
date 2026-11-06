import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentWorker } from '../integrations/live-chat/worker-client.mjs';

test('original agent worker can list chat messages and cast its own vote explicitly', async () => {
  const calls = [];
  const key = 'm_123456_0';
  const worker = createAgentWorker({
    baseUrl: 'https://bastilla.example.test',
    agent: 'Aria',
    token: 'a'.repeat(40),
    fetchImpl: async (url, options) => {
      const pathname = new URL(url).pathname;
      calls.push({ pathname, body: options.body && JSON.parse(options.body),
        token: options.headers.Authorization });
      const payload = pathname.endsWith('/worker/heartbeat') ? { agent: 'Aria' }
        : pathname.endsWith('/worker/messages') ? { messages: [{ messageKey: key, author: 'Alex', preview: 'Raport' }] }
        : pathname.endsWith('/worker/vote') ? { success: true, votes: { Aria: 'up' } }
        : pathname.endsWith('/worker/next') ? { agent: 'Aria', job: null } : null;
      if (!payload) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify(payload), { status: 200 });
    },
    runAgent: () => 'Real agent output',
  });
  const list = await worker.listReactionMessages();
  assert.equal(list[0].author, 'Alex');
  assert.equal(calls[0].pathname, '/api/live-chat/worker/heartbeat');
  assert.equal(calls[1].pathname, '/api/chat/reactions/worker/messages');
  assert.equal(calls.some(x => x.pathname.endsWith('/worker/vote')), false,
    'No fake or automatic votes');
  assert.deepEqual((await worker.voteOnMessage(key, 'up')).votes, { Aria: 'up' });
  assert.equal(calls.at(-1).pathname, '/api/chat/reactions/worker/vote');
  assert.deepEqual(calls.at(-1).body, { messageKey: key, vote: 'up' });
  assert.ok(calls.every(x => x.token === 'Bearer ' + 'a'.repeat(40)));
  await assert.rejects(worker.voteOnMessage('bad-id', 'up'), /reaction message key/);
  worker.stop();
});
