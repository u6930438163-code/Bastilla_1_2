import test from 'node:test';
import assert from 'node:assert/strict';
import { getLiveStatusPath, getLiveStatusSpec, parseLiveStatus } from '../src/lib/liveStatusData.mjs';

test('live_status exposes only two allowlisted read-only sources', () => {
  assert.equal(getLiveStatusPath('ollama_inventory'), '/api/ollama/models');
  assert.equal(getLiveStatusPath('agent_monitor'), '/api/agents/background/status');
  for (const source of ['https://evil.invalid', '/api/ollama/delete', 'system_metrics', '__proto__', 'constructor', 'toString']) {
    assert.equal(getLiveStatusPath(source), null);
    assert.equal(getLiveStatusSpec({ type: 'live_status', live: { source } }), null);
  }
  assert.equal(getLiveStatusSpec({ type: 'actions', live: { source: 'ollama_inventory' } }), null);
  assert.equal(getLiveStatusSpec({ type: 'live_status', live: { source: 'ollama_inventory', intervalMs: 1 } }).intervalMs, 5000);
  assert.equal(getLiveStatusSpec({ type: 'live_status', live: { source: 'agent_monitor', intervalMs: 99999 } }).intervalMs, 30000);
  assert.equal(getLiveStatusSpec({ type: 'live_status', live: { source: 'agent_monitor', intervalMs: Number.NaN } }).intervalMs, 15000);
});

test('live Ollama status stays offline when API is reachable but provider disconnected', () => {
  const value = parseLiveStatus('ollama_inventory', {
    connected: false,
    configuredModel: 'qwen3:14b',
    models: [{ name: 'qwen3:14b' }, { model: 'llama:8b' }],
    error: 'Ollama nie odpowiada',
  });
  assert.equal(value.connected, false);
  assert.equal(value.configuredModel, 'qwen3:14b');
  assert.deepEqual(value.models, ['qwen3:14b', 'llama:8b']);
  assert.match(value.error, /nie odpowiada/);
  assert.throws(() => parseLiveStatus('ollama_inventory', { models: [] }), /connected/);
});

test('agent monitor never invents worker execution state', () => {
  const value = parseLiveStatus('agent_monitor', {
    monitoring: true,
    agents: {
      Aria: { status: 'online', enabled: true, lastCheck: '2026-11-06T19:00:00.000Z' },
      Alex: { status: 'offline', enabled: false, error: 'Model offline' },
      Astyria: { status: 'totally-active-with-root', enabled: true },
      Aurelius: null,
    },
  });
  assert.equal(value.agents.length, 4);
  assert.deepEqual(value.agents.map(a => a.name), ['Aria','Alex','Astyria','Aurelius']);
  assert.deepEqual(value.agents.map(a => a.status), ['online','offline','waiting','waiting']);
  assert.match(value.note, /nie jest dowód pracy/);
  assert.throws(() => parseLiveStatus('agent_monitor', { agents: {} }), /monitoringu/);
  assert.throws(() => parseLiveStatus('unexpected', {}), /Nieobsługiwane/);
});
