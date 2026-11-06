import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LiveChatStore } from '../integrations/live-chat/store.mjs';

test('read-only task status accurately distinguishes expired leases, retrying and failures', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bastilla-queue-metrics-'));
  let now=Date.now();
  const store=new LiveChatStore({filePath:path.join(dir,'state.json'),now:()=>now});
  try {
    await store.createUserMessage({channel:'Wszyscy',text:'Test',recipients:['Aria','Alex']});
    let aria=await store.claimNext('Aria','aria-1',10000);
    let alex=await store.claimNext('Alex','alex-1',10000);
    let status=store.getStatus();
    assert.equal(status.queue.running,2);
    assert.equal(status.queue.expiredLeases,0);
    assert.equal(status.queue.retrying,0);
    now+=11000;
    status=store.getStatus();
    assert.equal(status.queue.expiredLeases,2);
    assert.equal(status.agents.Aria.expiredLeases,1);
    assert.equal(status.agents.Alex.expiredLeases,1);
    // Reading dashboard never mutates the queue.
    assert.equal(store.getStatus().queue.running,2);
    aria=await store.claimNext('Aria','aria-2',10000);
    assert.equal(aria.attempts,2);
    await store.failJob({id:aria.id,agent:'Aria',workerId:'aria-2',attempt:2,error:'temporary'});
    status=store.getStatus();
    assert.equal(status.queue.retrying,1);
    assert.equal(status.agents.Aria.retrying,1);
    assert.equal(status.agents.Aria.expiredLeases,0);
    assert.equal(status.agents.Alex.expiredLeases,1);
    now+=3100;
    aria=await store.claimNext('Aria','aria-3',10000);
    assert.equal(aria.attempts,3);
    await store.failJob({id:aria.id,agent:'Aria',workerId:'aria-3',attempt:3,error:'permanent'});
    status=store.getStatus();
    assert.equal(status.queue.failed,1);
    assert.equal(status.agents.Aria.failed,1);
    assert.equal(status.queue.retrying,0);
    assert.equal(status.queue.expiredLeases,1);
    assert.equal(status.agents.Alex.failed,0);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
