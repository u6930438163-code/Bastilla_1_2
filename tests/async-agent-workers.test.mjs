import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentWorker } from '../integrations/live-chat/worker-client.mjs';

const waitFor = async (predicate, timeoutMs = 3000) => {
  const stopAt = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= stopAt) throw new Error('Timed out waiting for worker state');
    await new Promise(resolve => setTimeout(resolve, 15));
  }
};

test('asynchronous worker completes up to two real jobs concurrently while preserving leases', async () => {
  const queue = ['task1', 'task2', 'task3'].map(id => ({ id, channel:'Wszyscy', text:'Work ' + id }));
  const starts = [];
  const releases = new Map();
  const heartbeats = [];
  const completed = [];
  let active = 0;
  let peak = 0;
  let idleCalls = 0;

  const worker = createAgentWorker({
    baseUrl:'https://bastilla.example.test',
    agent:'Alex', token:'a'.repeat(40),
    maxConcurrency:2, pollIntervalMs:500,
    onIdle:async () => { idleCalls++; },
    fetchImpl:async (url,options) => {
      const endpoint = new URL(url).pathname;
      const payload = options?.body ? JSON.parse(options.body) : null;
      let response;
      if (endpoint.endsWith('/worker/heartbeat')) {
        heartbeats.push(payload); response = {agent:'Alex'};
      } else if (endpoint.endsWith('/worker/next')) {
        response = {agent:'Alex', job:queue.shift() || null};
      } else if (endpoint.endsWith('/worker/events')) {
        completed.push(payload.taskId); response = {event:{id:'event-' + payload.taskId}};
      } else if (endpoint.endsWith('/heartbeat') && endpoint.includes('/worker/jobs/')) {
        response = {success:true};
      } else if (endpoint.endsWith('/fail')) {
        throw new Error('Unexpected failure: ' + JSON.stringify(payload));
      } else {
        throw new Error('Unexpected worker request: ' + endpoint);
      }
      return new Response(JSON.stringify(response), {status:200});
    },
    runAgent:async job => {
      starts.push(job.id); active++; peak=Math.max(peak,active);
      await new Promise(resolve => releases.set(job.id,resolve));
      active--;
      return 'Completed ' + job.id;
    },
  });
  assert.equal(worker.maxConcurrency,2);
  const stopController = new AbortController();
  const running=worker.start({signal:stopController.signal});
  try {
    await waitFor(() => starts.length === 2);
    assert.equal(active,2);
    assert.equal(peak,2);
    assert.equal(starts.includes('task3'),false);
    assert.equal(idleCalls,0);
    assert.equal(heartbeats[0].concurrency,2);
    releases.get('task1')();
    await waitFor(() => starts.length === 3);
    assert.equal(starts[2],'task3');
    releases.get('task2')();
    releases.get('task3')();
    await waitFor(() => completed.length === 3);
    assert.deepEqual(new Set(completed),new Set(['task1','task2','task3']));
  } finally {
    stopController.abort();
    for(const release of releases.values()) release();
    await running;
  }
});

test('max concurrency is bounded and permits sequential fallback', () => {
  const options={baseUrl:'https://bastilla.example.test',agent:'Aria',token:'a'.repeat(40),
    runAgent:async()=> 'ok',fetchImpl:async()=> new Response('{}')};
  assert.equal(createAgentWorker({...options,maxConcurrency:100}).maxConcurrency,4);
  assert.equal(createAgentWorker({...options,maxConcurrency:1}).maxConcurrency,1);
  assert.equal(createAgentWorker({...options,maxConcurrency:NaN}).maxConcurrency,2);
});
