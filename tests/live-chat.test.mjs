import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createLiveChatRouter } from '../integrations/live-chat/router.mjs';

async function withServer(run) {
  const app=express();
  app.use(express.json());
  const requireUser=(req,res,next)=>req.get('x-test-user')==='yes'?next():res.sendStatus(401);
  const requireWorker=(req,res,next)=>{
    if(req.get('x-test-worker')!=='verified') return res.sendStatus(401);
    req.agentIdentity='Alex';
    next();
  };
  app.use('/api/live-chat',createLiveChatRouter({requireUser,requireWorker}));
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  try {await run('http://127.0.0.1:'+server.address().port+'/api/live-chat');}
  finally {await new Promise(resolve=>server.close(resolve));}
}

test('live chat rejects unauthenticated requests and accepts verified worker events',async()=>{
  await withServer(async base=>{
    assert.equal((await fetch(base+'/history')).status,401);
    assert.equal((await fetch(base+'/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel:'Wszyscy',text:'hello'})})).status,401);
    const bad=await fetch(base+'/worker/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel:'Wszyscy',type:'message',text:'spoof',sender:'Alex'})});
    assert.equal(bad.status,401);
    const accepted=await fetch(base+'/worker/events',{method:'POST',headers:{'Content-Type':'application/json','x-test-worker':'verified'},body:JSON.stringify({channel:'Wszyscy',type:'message',text:'worker event',sender:'Aria'})});
    assert.equal(accepted.status,202);
    assert.equal((await accepted.json()).sender,'Alex');
    const history=await fetch(base+'/history?channel=Wszyscy',{headers:{'x-test-user':'yes'}});
    assert.equal(history.status,200);
    assert.equal((await history.json()).length,1);
    const invalid=await fetch(base+'/messages',{method:'POST',headers:{'Content-Type':'application/json','x-test-user':'yes'},body:JSON.stringify({channel:'unknown',text:'hello'})});
    assert.equal(invalid.status,400);
  });
});
