import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AGENT_WORKER_PROFILES, resolveAgentWorkerPolicy } from '../integrations/live-chat/asymmetric-policy.mjs';
import { createAgentWorker } from '../integrations/live-chat/worker-client.mjs';
import { LiveChatStore } from '../integrations/live-chat/store.mjs';

test('asymmetrical defaults preserve agent identity and total pool cap', () => {
  const agents=['Aria','Alex','Astyria','Aurelius'];
  const policies=agents.map(agent => resolveAgentWorkerPolicy(agent, {}));
  assert.deepEqual(policies.map(p=>p.concurrency), [2,3,1,2]);
  assert.equal(policies.reduce((sum,p)=>sum+p.concurrency,0),8);
  assert.equal(new Set(policies.map(p=>p.role)).size,4);
  assert.ok(policies.every(p => p.mode === 'asymmetric'));
  assert.deepEqual(Object.keys(AGENT_WORKER_PROFILES),agents);
});

test('uniform fallback and explicit per-agent overrides are bounded and deterministic', () => {
  assert.equal(resolveAgentWorkerPolicy('Astyria', {BASTILLA_WORKER_MODE:'uniform'}).concurrency,2);
  assert.equal(resolveAgentWorkerPolicy('Alex', {
    BASTILLA_WORKER_MODE:'uniform',
    BASTILLA_AGENT_CONCURRENCY:'1',
    BASTILLA_AGENT_POLL_INTERVAL_MS:'650',
    BASTILLA_AGENT_IDLE_INTERVAL_MS:'6500',
  }).mode,'custom');
  assert.deepEqual(
    (({concurrency,pollIntervalMs,idleCallbackIntervalMs})=>[concurrency,pollIntervalMs,idleCallbackIntervalMs])
    (resolveAgentWorkerPolicy('Alex', {
      BASTILLA_AGENT_CONCURRENCY:'1',
      BASTILLA_AGENT_POLL_INTERVAL_MS:'650',
      BASTILLA_AGENT_IDLE_INTERVAL_MS:'6500',
    })), [1,650,6500],
  );
  assert.throws(()=>resolveAgentWorkerPolicy('unknown',{}),/Unknown original agent/);
  assert.throws(()=>resolveAgentWorkerPolicy('Alex',{BASTILLA_WORKER_MODE:'invalid'}),/WORKER_MODE/);
  assert.throws(()=>resolveAgentWorkerPolicy('Alex',{BASTILLA_AGENT_CONCURRENCY:'5'}),/CONCURRENCY/);
  assert.throws(()=>resolveAgentWorkerPolicy('Alex',{BASTILLA_AGENT_CONCURRENCY:'0'}),/CONCURRENCY/);
  assert.throws(()=>resolveAgentWorkerPolicy('Alex',{BASTILLA_AGENT_POLL_INTERVAL_MS:'100'}),/POLL_INTERVAL_MS/);
  assert.throws(()=>resolveAgentWorkerPolicy('Alex',{BASTILLA_AGENT_IDLE_INTERVAL_MS:'300'}),/IDLE_INTERVAL_MS/);
});

test('mode is sent only by authenticated worker heartbeat and visible in store status', async () => {
  const sent=[];
  const policy=resolveAgentWorkerPolicy('Alex',{});
  const worker=createAgentWorker({
    baseUrl:'https://bastilla.example.test',agent:'Alex',token:'x'.repeat(40),
    policyMode:policy.mode,maxConcurrency:policy.concurrency,
    pollIntervalMs:policy.pollIntervalMs,
    runAgent:async()=>({text:'actual agent response'}),
    fetchImpl:async (url,options) => {
      const endpoint=new URL(url).pathname;
      sent.push({endpoint,body:options.body?JSON.parse(options.body):null});
      if(endpoint.endsWith('/worker/heartbeat'))return new Response(JSON.stringify({agent:'Alex'}));
      if(endpoint.endsWith('/worker/next'))return new Response(JSON.stringify({agent:'Alex',job:null}));
      throw new Error('Unexpected endpoint: '+endpoint);
    },
  });
  assert.equal(await worker.pollOnce(),false);
  worker.stop();
  assert.deepEqual(sent[0].body,{concurrency:3,mode:'asymmetric'});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bastilla-asymmetric-'));
  try {
    const store=new LiveChatStore({filePath:path.join(dir,'state.json')});
    await store.heartbeat('Alex','alex-real-worker',3,'asymmetric');
    let state=store.getStatus().agents.Alex;
    assert.equal(state.status,'online');
    assert.equal(state.concurrency,3);
    assert.equal(state.mode,'asymmetric');
    await store.heartbeat('Astyria','astyria-real-worker',1,'not-valid');
    assert.equal(store.getStatus().agents.Astyria.mode,null);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
