import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DIAGNOSTIC_TOOLS, diagnosticInventory, diagnosticSnapshot, findExecutable, createBackgroundAgentDiagnostics } from '../integrations/diagnostics/catalog.mjs';

test('catalog has 50 distinct GitHub tools and unique specialties', () => {
  assert.equal(DIAGNOSTIC_TOOLS.length, 50);
  assert.equal(new Set(DIAGNOSTIC_TOOLS.map(t => t.repository)).size, 50);
  assert.equal(new Set(DIAGNOSTIC_TOOLS.map(t => t.id)).size, 50);
  for (const t of DIAGNOSTIC_TOOLS) {
    assert.match(t.github, /^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/);
    assert.ok(['Aria','Alex','Astyria','Aurelius'].includes(t.agent));
  }
});
test('PATH detection does not execute binaries', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bastilla-tools-'));
  try {
    const binary = path.join(dir, 'fake-tool');
    fs.writeFileSync(binary, '#!/bin/sh\necho SHOULD_NOT_EXECUTE\n', {mode:0o700});
    assert.equal(findExecutable('fake-tool', dir), true);
    assert.equal(findExecutable('../fake-tool', dir), false);
    assert.equal(findExecutable('missing', dir), false);
    const inventory = diagnosticInventory(dir);
    assert.equal(inventory.total, 50);
    assert.equal(inventory.tools.length, 50);
    assert.equal(inventory.pathDetected, 0);
  } finally { fs.rmSync(dir, {recursive:true,force:true}); }
});
test('host snapshot contains bounded numeric measurements', () => {
  const snapshot=diagnosticSnapshot();
  assert.ok(snapshot.cpuCount>=1);
  assert.ok(snapshot.availableMemoryBytes>=0);
  assert.ok(snapshot.uptimeSeconds>=0);
});
test('background diagnostics posts only real threshold changes, never repairs', async () => {
  const seen=[];
  let time=1000000;
  const snapshotProvider=()=>({
    sampledAt:'2026-11-06T18:00:00Z',hostScope:'test-container',
    diskFreePercent:4, availableMemoryPercent:45, load1m:1,cpuCount:2,
    storeWeakPermissions:false,workerRunsAsRoot:false,
  });
  const monitor=createBackgroundAgentDiagnostics({agent:'Alex',now:()=>time,intervalMs:60000,snapshotProvider});
  const context={sendMessage:async(text,options)=>seen.push({text,options})};
  assert.equal(await monitor(context),true);
  assert.equal(await monitor(context),false);
  time+=61000;
  assert.equal(await monitor(context),false);
  assert.equal(seen.length,1);
  assert.match(seen[0].text,/dysku poniżej 10%/);
  assert.equal(seen[0].options.channel,'Wszyscy');
});

test('Aurelius reports absent non-loopback interface and retries failed delivery', async () => {
  let time = 2000000;
  const snapshotProvider = () => ({ sampledAt:'2026-11-06T18:00:00Z', hostScope:'test-container', networkInterfaceCount:0 });
  const monitor = createBackgroundAgentDiagnostics({ agent:'Aurelius', now:()=>time, intervalMs:60000, snapshotProvider });
  await assert.rejects(monitor({ sendMessage: async () => { throw new Error('temporary network error'); } }), /temporary network error/);
  time += 61000;
  const out=[];
  assert.equal(await monitor({ sendMessage: async text => out.push(text) }), true);
  assert.equal(out.length, 1);
  assert.match(out[0], /interfejsu sieciowego/);
});
