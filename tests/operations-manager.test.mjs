import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import {
  redactDiagnostic, parseProcessSnapshot, makeLogsSnapshot,
  probeOllama, createOperationsRouter,
} from '../integrations/operations/router.mjs';

test('process parser returns only real supplied ps records, never fabricated PIDs or shell args', () => {
  const parsed = parseProcessSnapshot(
    ' 12 1 node 3.5 24672 Sl 00:11:02\n' +
    ' 33 12 python3 21.0 32768 R 01:03\n' +
    ' invalid ignored\n',
  );
  assert.deepEqual(parsed.map(x => x.pid), [33, 12]);
  assert.equal(parsed[0].name, 'python3');
  assert.equal(parsed[1].rssBytes, 24672 * 1024);
  assert.equal(parsed[0].cpuPercent, 21);
  assert.equal(parsed[0].elapsed, '01:03');
});

test('logs use explicit success/error/info categories and scrub common secrets', () => {
  const logs = [
    { id: 'a', level: 'healed', source: 'KERNEL', timestamp: '11:00', message: 'Refresh succeeded' },
    { id: 'b', level: 'error', source: 'EXPRESS', timestamp: '11:01', message: 'Bearer SECRET_PASSWORD_123 password=keep-this-private' },
    { id: 'c', level: 'warn', source: 'INFRA', timestamp: '11:02', message: 'Slow request' },
    { id: 'd', level: 'info', source: 'AGENT', timestamp: '11:03', message: 'Normal trace' },
  ];
  const all = makeLogsSnapshot(logs);
  assert.deepEqual(all.counts, { all: 4, errors: 2, success: 1, info: 1 });
  assert.equal(all.logs[0].id, 'd');
  assert.equal(makeLogsSnapshot(logs, 'success').logs[0].id, 'a');
  const failures = makeLogsSnapshot(logs, 'errors').logs;
  assert.deepEqual(failures.map(x => x.id), ['c', 'b']);
  assert.doesNotMatch(failures[1].message, /keep-this-private|SECRET_PASSWORD_123/);
  assert.match(failures[1].message, /REDACTED/);
  assert.equal(redactDiagnostic('token=very-sensitive'), 'token=[REDACTED]');
});

test('Ollama status is grounded in tags/ps and shows RAM/VRAM without pretending that models are loaded', async () => {
  const responses = {
    '/api/version': { version: '0.20.0' },
    '/api/tags': { models: [{ name: 'qwen:14b', size: 35e9 }] },
    '/api/ps': { models: [{ name: 'qwen:14b', size: 14e9, size_vram: 8e9, expires_at: '2026-12-01T00:00:00Z' }] },
  };
  const fakeFetch = async (url) => ({ ok: true, json: async () => responses[new URL(url).pathname] });
  const baseConfig = {
    baseUrl: 'http://127.0.0.1:11434', configuredModel: 'qwen:14b',
    providers: ['ollama'],
    localFallback: false, keepAlive: '24h',
  };
  const result = await probeOllama(baseConfig, fakeFetch);
  assert.equal(result.connected, true);
  assert.equal(result.modelLoaded, true);
  assert.equal(result.runningModels[0].estimatedRamBytes, 6e9);
  assert.equal(result.runningModels[0].vramBytes, 8e9);
  assert.equal(result.installedModels[0].name, 'qwen:14b');
  assert.deepEqual(result.configuredProviders, ['ollama']);
  const wrongModel = await probeOllama({ ...baseConfig, configuredModel: 'other:7b' }, fakeFetch);
  assert.equal(wrongModel.modelLoaded, false);
});

test('Ollama /api/ps unavailable means memory unknown, not offline or empty RAM', async () => {
  const fakeFetch = async url => {
    const path = new URL(url).pathname;
    if (path === '/api/version') return { ok: true, json: async () => ({ version: '0.19.0' }) };
    throw new Error('Service unavailable');
  };
  const config = { baseUrl: 'http://127.0.0.1:11434', configuredModel: 'qwen:14b', providers: ['ollama'] };
  const result = await probeOllama(config, fakeFetch);
  assert.equal(result.connected, true);
  assert.equal(result.modelLoaded, null);
  assert.equal(result.runningModels, null);
  assert.equal(result.memoryCheckAvailable, false);
});

test('operations endpoints require operator auth and never execute arbitrary client commands', { timeout: 8000 }, async t => {
  const app = express();
  const executed = [];
  const router = createOperationsRouter({
    requireUser: (req, res, next) => req.get('X-Test-Operator') === 'authorized'
      ? next() : res.status(401).json({ error: 'Authorization required' }),
    getLogs: () => [{ id: 'error-1', level: 'error', source: 'KERNEL', timestamp: '12:00', message: 'Provider offline' }],
    getConfig: () => ({ baseUrl: 'http://localhost:11434', configuredModel: 'model:1b', providers: ['ollama'] }),
    execFileAsync: async (command, args) => {
      executed.push([command, args]);
      return { stdout: '24 1 node 2.5 33000 Sl 01:04\n' };
    },
    fetchImpl: async url => {
      const path = new URL(url).pathname;
      return { ok: true, json: async () => path === '/api/ps' ? { models: [] } : path === '/api/tags'
        ? { models: [] } : { version: '0.20.0' } };
    },
  });
  app.use('/api/operations', router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const origin = 'http://127.0.0.1:' + server.address().port + '/api/operations';
  const unauthorized = await fetch(origin + '/logs');
  assert.equal(unauthorized.status, 401);
  const headers = { 'X-Test-Operator': 'authorized' };
  const logs = await fetch(origin + '/logs?filter=errors', { headers });
  assert.equal(logs.status, 200);
  assert.equal((await logs.json()).logs[0].category, 'error');
  assert.equal(logs.headers.get('cache-control'), 'no-store');
  const proc = await fetch(origin + '/processes', { headers });
  assert.equal(proc.status, 200);
  assert.equal((await proc.json()).processes[0].pid, 24);
  assert.equal(executed.length, 1);
  assert.equal(executed[0][0], 'ps');
  assert.deepEqual(executed[0][1], ['-eo', 'pid=,ppid=,comm=,%cpu=,rss=,stat=,etime=']);
  assert.equal((await fetch(origin + '/execute', { method: 'POST', headers })).status, 404);
  const ollama = await fetch(origin + '/ollama', { headers });
  assert.equal((await ollama.json()).modelLoaded, false);
});
