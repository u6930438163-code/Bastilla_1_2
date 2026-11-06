import test from 'node:test';
import assert from 'node:assert/strict';
import { abortableSleep, createAgentWorker } from '../integrations/live-chat/worker-client.mjs';

test('abortable polling sleep removes listeners after normal timeout and abort', async () => {
  const controller = new AbortController();
  const signal = controller.signal;
  const origAdd=signal.addEventListener.bind(signal);
  const origRemove=signal.removeEventListener.bind(signal);
  let registered=0;
  let removed=0;
  signal.addEventListener=(...args)=>{if(args[0]==='abort')registered++;return origAdd(...args);};
  signal.removeEventListener=(...args)=>{if(args[0]==='abort')removed++;return origRemove(...args);};
  try {
    for(let n=0;n<25;n++) await abortableSleep(1,signal);
    assert.equal(registered,25);
    assert.equal(removed,25);
    const aborted=abortableSleep(10000,signal);
    controller.abort();
    await aborted;
    assert.equal(registered,26);
    assert.equal(removed,26);
    await abortableSleep(1,signal);
    assert.equal(registered,26);
  } finally {
    signal.addEventListener=origAdd;
    signal.removeEventListener=origRemove;
  }
});

test('long-running real idle callback keeps authenticated worker heartbeat online', async () => {
  const controller=new AbortController();
  const events=[];
  let idleStarted;
  const beganIdle=new Promise(resolve=>{idleStarted=resolve;});
  let endIdle;
  const idleWait=new Promise(resolve=>{endIdle=resolve;});
  const worker=createAgentWorker({
    agent:'Aurelius',
    baseUrl:'https://bastilla.example.test',
    token:'z'.repeat(40),
    heartbeatIntervalMs:5000,
    pollIntervalMs:500,
    idleCallbackIntervalMs:5000,
    fetchImpl:async (url,options)=>{
      const endpoint=new URL(url).pathname;
      events.push(endpoint);
      if(endpoint.endsWith('/worker/heartbeat')){
        return new Response(JSON.stringify({agent:'Aurelius'}),{status:200});
      }
      if(endpoint.endsWith('/worker/next')){
        return new Response(JSON.stringify({agent:'Aurelius',job:null}),{status:200});
      }
      throw new Error('Unexpected endpoint '+endpoint);
    },
    runAgent: async()=>({text:'real agent'}),
    onIdle: async()=>{idleStarted();await idleWait;},
  });
  const running=worker.start({signal:controller.signal});
  try {
    await beganIdle;
    await new Promise(resolve=>setTimeout(resolve,5700));
    const heartbeats=events.filter(path=>path.endsWith('/worker/heartbeat'));
    assert.ok(heartbeats.length>=2, 'heartbeat must continue during onIdle');
  } finally {
    controller.abort();
    endIdle();
    await running;
  }
});
