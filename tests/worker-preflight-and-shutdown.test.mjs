import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAgentWorker } from '../integrations/live-chat/worker-client.mjs';
import { WORKER_NAMES, inspectWorkerFile, getWorkerPreflight, parseWorkerConfig } from '../scripts/check-live-chat-workers.mjs';

test('preflight checks all original workers without echoing secrets', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bastilla-preflight-'));
  const secret='S'.repeat(48);
  try {
    for (const agent of WORKER_NAMES) {
      fs.writeFileSync(path.join(dir,agent+'.env'), [
        'BASTILLA_LIVE_CHAT_AGENT='+agent,
        'BASTILLA_LIVE_CHAT_BASE_URL="https://bastilla.example.test"',
        'BASTILLA_LIVE_CHAT_WORKER_TOKEN='+secret,
        'BASTILLA_AGENT_ADAPTER=integrations/live-chat/http-agent-adapter.mjs',
        'BASTILLA_AGENT_ENDPOINT=https://private-original.example.test/run',
        'BASTILLA_AGENT_API_KEY='+secret,
      ].join('\n'),{mode:0o600});
    }
    const status=getWorkerPreflight({configDirectory:dir,runner:()=>({status:0})});
    assert.equal(status.configReady,true);
    assert.equal(status.servicesActive,true);
    assert.equal(status.workers.length,4);
    assert.ok(!JSON.stringify(status).includes(secret));
    assert.ok(!JSON.stringify(status).includes('private-original.example.test'));
    fs.chmodSync(path.join(dir,'Aria.env'),0o644);
    const unsafe=getWorkerPreflight({configDirectory:dir,runner:()=>({status:1})});
    assert.equal(unsafe.configReady,false);
    assert.equal(unsafe.servicesActive,false);
    assert.ok(unsafe.workers[0].issues.includes('weak-secret-permissions'));
    fs.chmodSync(path.join(dir,'Aria.env'),0o600);
    fs.writeFileSync(path.join(dir,'Aria.env'),'BASTILLA_LIVE_CHAT_AGENT=Alex\n',{mode:0o600});
    assert.ok(inspectWorkerFile(path.join(dir,'Aria.env'),'Aria').issues.includes('agent-identity-mismatch'));
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test('worker env parser never evaluates shell payloads', () => {
  const parsed=parseWorkerConfig('BASTILLA_LIVE_CHAT_AGENT=Alex\n# ignored\nBASTILLA_AGENT_ENDPOINT="$(touch /tmp/should-not-exist)"\n');
  assert.equal(parsed.BASTILLA_LIVE_CHAT_AGENT,'Alex');
  assert.equal(parsed.BASTILLA_AGENT_ENDPOINT,'$(touch /tmp/should-not-exist)');
});

test('shutdown is bounded if original agent ignores AbortSignal', async () => {
  let calls=0;
  const controller=new AbortController();
  const worker=createAgentWorker({
    baseUrl:'https://bastilla.example.test', agent:'Aria', token:'x'.repeat(40),
    shutdownTimeoutMs:1000, pollIntervalMs:500,
    fetchImpl:async (url) => {
      const p=new URL(url).pathname;
      if(p.endsWith('/worker/heartbeat'))return new Response(JSON.stringify({agent:'Aria'}));
      if(p.endsWith('/worker/next'))return new Response(JSON.stringify({agent:'Aria',job:{id:'hung',attempts:1,channel:'Aria'}}));
      return new Response(JSON.stringify({success:true}));
    },
    runAgent:async () => {calls++; return new Promise(()=>{});},
  });
  const running=worker.start({signal:controller.signal});
  const until=Date.now()+3000;
  while(!calls && Date.now()<until) await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(calls,1);
  controller.abort();
  const started=Date.now();
  await running;
  assert.ok(Date.now()-started < 2500);
  assert.equal(worker.shutdownTimeoutMs,1000);
});
