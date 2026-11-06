import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LiveChatStore } from '../integrations/live-chat/store.mjs';
import { createLiveChatRouter } from '../integrations/live-chat/router.mjs';
import { createLiveChatSessionAuth, createLiveChatWorkerAuth } from '../integrations/live-chat/auth.mjs';
import express from 'express';

async function fixture(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bastilla-fenced-'));
  let instant = Date.now();
  const store = new LiveChatStore({ filePath: path.join(directory, 'state.json'), now: () => instant });
  try { await run({ store, advance: ms => { instant += ms; } }); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('stale worker cannot complete, retry or renew after lease is reclaimed', async () => {
  await fixture(async ({store,advance}) => {
    await store.createUserMessage({ channel:'Alex', text:'Diagnozuj serwer', recipients:['Alex'] });
    const first = await store.claimNext('Alex','worker-old',10000);
    assert.equal(first.attempts,1);
    advance(11000);
    const second = await store.claimNext('Alex','worker-new',10000);
    assert.equal(second.id,first.id);
    assert.equal(second.attempts,2);
    const old={agent:'Alex',workerId:'worker-old',taskAttempt:1,channel:'Alex',
      type:'message',text:'Spóźniona odpowiedź',taskId:first.id};
    await assert.rejects(store.createAgentEvent(old),/JOB_NOT_OWNED/);
    await assert.rejects(store.renewLease({id:first.id,agent:'Alex',workerId:'worker-old',attempt:1}),/JOB_NOT_OWNED/);
    await assert.rejects(store.failJob({id:first.id,agent:'Alex',workerId:'worker-old',attempt:1,error:'oops'}),/JOB_NOT_OWNED/);
    await assert.rejects(store.failJob({id:first.id,agent:'Alex',workerId:'worker-new',attempt:1,error:'oops'}),/JOB_NOT_OWNED/);
    await assert.rejects(store.createAgentEvent({...old,workerId:'worker-new'}),/JOB_NOT_OWNED/);
    assert.equal(store.getStatus().queue.running,1);
    const valid = await store.createAgentEvent({...old,workerId:'worker-new',taskAttempt:2,text:'Prawidłowy raport'});
    assert.equal(valid.event.text,'Prawidłowy raport');
    assert.equal(store.getStatus().queue.running,0);
    assert.equal(store.getHistory('Alex').length,2);
    await assert.rejects(store.createAgentEvent({...old,workerId:'worker-new',taskAttempt:2}),/JOB_NOT_OWNED/);
  });
});

test('the same worker id cannot replay an older attempt after reclaim', async () => {
  await fixture(async ({store,advance}) => {
    await store.createUserMessage({ channel:'Aria',text:'Sprawdź RAM',recipients:['Aria'] });
    const first=await store.claimNext('Aria','same-worker',10000);
    advance(11000);
    const second=await store.claimNext('Aria','same-worker',10000);
    assert.equal(second.attempts,first.attempts+1);
    await assert.rejects(store.renewLease({id:second.id,agent:'Aria',workerId:'same-worker',attempt:first.attempts}),/JOB_NOT_OWNED/);
    const current=await store.renewLease({id:second.id,agent:'Aria',workerId:'same-worker',attempt:second.attempts});
    assert.ok(current.leaseUntil > 0);
    const retried=await store.failJob({id:second.id,agent:'Aria',workerId:'same-worker',attempt:second.attempts,error:'endpoint temporarily unavailable'});
    assert.equal(retried.status,'queued');
    assert.equal(store.getStatus().queue.queued,1);
  });
});

test('HTTP API rejects event with missing attempt and cross-worker result', async () => {
  await fixture(async ({store}) => {
    const app=express(); app.use(express.json());
    const server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    const tokens={Aria:'a'.repeat(40),Alex:'b'.repeat(40),Astyria:'c'.repeat(40),Aurelius:'d'.repeat(40)};
    const session=createLiveChatSessionAuth({password:'correct horse battery staple',secret:'s'.repeat(48),allowedOrigin:base,cookieSecure:false});
    app.use('/api/live-chat',createLiveChatRouter({store,requireUser:session.requireUser,requireWorker:createLiveChatWorkerAuth({tokens}),session}));
    try {
      await store.createUserMessage({channel:'Alex',text:'Test',recipients:['Alex']});
      const job=await store.claimNext('Alex','actual-worker',60000);
      const body={channel:'Alex',type:'message',text:'Raport',taskId:job.id};
      const post=async(workerId,payload)=>fetch(base+'/api/live-chat/worker/events',{
        method:'POST',headers:{Authorization:'Bearer '+tokens.Alex,'X-Worker-Id':workerId,'Content-Type':'application/json'},
        body:JSON.stringify(payload),
      });
      const missing=await post('actual-worker',body);
      assert.equal(missing.status,400);
      const wrong=await post('wrong-worker',{...body,taskAttempt:job.attempts});
      assert.equal(wrong.status,409);
      const okay=await post('actual-worker',{...body,taskAttempt:job.attempts});
      assert.equal(okay.status,202);
      assert.equal(store.getStatus().queue.running,0);
    } finally {await new Promise(resolve=>server.close(resolve));}
  });
});
