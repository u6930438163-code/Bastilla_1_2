import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_EXCLUSIVE_OLLAMA_MODEL,
  deleteOllamaModel,
  isSameOllamaModel,
  listOllamaModels,
  syncOllamaExclusiveModel,
} from '../src/kernel/ollamaManager.ts';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

test('isSameOllamaModel normalizuje domyślny tag :latest i wielkość liter', () => {
  assert.equal(isSameOllamaModel('wizard-vicuna-uncensored:13b', 'WIZARD-VICUNA-UNCENSORED:13B'), true);
  assert.equal(isSameOllamaModel('llama3.2', 'llama3.2:latest'), true);
  assert.equal(isSameOllamaModel('wizard-vicuna-uncensored:13b', 'qwen3:14b'), false);
  assert.equal(DEFAULT_EXCLUSIVE_OLLAMA_MODEL, 'wizard-vicuna-uncensored:13b');
});

test('syncOllamaExclusiveModel pobiera wizard-vicuna-uncensored:13b, usuwa inne modele i uruchamia model w pamięci', async () => {
  const calls = [];
  let installed = [
    { name: 'qwen3:14b', size: 9_300_000_000 },
    { name: 'gemma3:4b', size: 3_200_000_000 },
    { name: 'nomic-embed-text:latest', size: 274_000_000 },
  ];

  const fetchImpl = async (url, init = {}) => {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: String(url), method, body });

    if (String(url).endsWith('/api/version')) {
      return json(200, { version: '0.9.0' });
    }
    if (String(url).endsWith('/api/pull') && method === 'POST') {
      installed.push({
        name: body.model,
        size: 26_000_000_000,
        details: { parameter_size: '46.7B', quantization_level: 'Q4_0' },
      });
      return json(200, { status: 'success' });
    }
    if (String(url).endsWith('/api/tags') && method === 'GET') {
      return json(200, { models: installed });
    }
    if (String(url).endsWith('/api/delete') && method === 'DELETE') {
      installed = installed.filter((m) => m.name !== body.model);
      return json(200, {});
    }
    if (String(url).endsWith('/api/chat') && method === 'POST') {
      return json(200, { done: true, model: body.model });
    }
    throw new Error(`Nieoczekiwane wywołanie: ${method} ${url}`);
  };

  const result = await syncOllamaExclusiveModel({
    baseUrl: 'http://127.0.0.1:11434',
    targetModel: 'wizard-vicuna-uncensored:13b',
    pruneOthers: true,
    warmup: true,
    fetchImpl,
  });

  assert.equal(result.ok, true);
  assert.equal(result.connected, true);
  assert.equal(result.configuredModel, 'wizard-vicuna-uncensored:13b');
  assert.equal(result.pulled, true);
  assert.equal(result.warmedUp, true);
  assert.deepEqual(result.keptModels, ['wizard-vicuna-uncensored:13b']);
  assert.deepEqual(result.removedModels, ['qwen3:14b', 'gemma3:4b', 'nomic-embed-text:latest']);
  assert.equal(result.models.length, 1);
  assert.equal(result.models[0].name, 'wizard-vicuna-uncensored:13b');

  const pullCall = calls.find((c) => c.url.endsWith('/api/pull'));
  assert.equal(pullCall.body.model, 'wizard-vicuna-uncensored:13b');
  assert.equal(pullCall.body.stream, false);

  const deleteCalls = calls.filter((c) => c.url.endsWith('/api/delete'));
  assert.deepEqual(
    deleteCalls.map((c) => c.body.model),
    ['qwen3:14b', 'gemma3:4b', 'nomic-embed-text:latest'],
  );

  const warmCall = calls.find((c) => c.url.endsWith('/api/chat'));
  assert.equal(warmCall.body.model, 'wizard-vicuna-uncensored:13b');
  assert.deepEqual(warmCall.body.messages, []);
});

test('syncOllamaExclusiveModel nie symuluje połączenia, gdy serwer Ollama nie odpowiada', async () => {
  const fetchImpl = async () => {
    throw new TypeError('fetch failed');
  };

  const result = await syncOllamaExclusiveModel({
    baseUrl: 'http://127.0.0.1:11434',
    targetModel: 'wizard-vicuna-uncensored:13b',
    fetchImpl,
  });

  assert.equal(result.ok, false);
  assert.equal(result.connected, false);
  assert.equal(result.configuredModel, 'wizard-vicuna-uncensored:13b');
  assert.equal(result.pulled, false);
  assert.equal(result.warmedUp, false);
  assert.match(result.error || '', /wizard-vicuna-uncensored:13b/);
});

test('listOllamaModels i deleteOllamaModel obsługują API Ollamy poprawnie', async () => {
  const deleted = [];
  const fetchImpl = async (url, init = {}) => {
    if (String(url).endsWith('/api/tags')) {
      return json(200, { models: [{ name: 'wizard-vicuna-uncensored:13b', size: 26_000_000_000 }] });
    }
    if (String(url).endsWith('/api/delete')) {
      deleted.push(JSON.parse(init.body).model);
      return json(200, {});
    }
    return json(404, {});
  };

  const models = await listOllamaModels('http://127.0.0.1:11434', fetchImpl);
  assert.equal(models.length, 1);
  assert.equal(models[0].name, 'wizard-vicuna-uncensored:13b');

  await deleteOllamaModel('http://127.0.0.1:11434', 'old-model:1b', fetchImpl);
  assert.deepEqual(deleted, ['old-model:1b']);
});

test('przywrócenie Ollamy bez pruneOthers nigdy nie usuwa istniejących modeli', async () => {
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    calls.push({ path, method: init.method || 'GET' });
    if (path === '/api/version') return json(200, { version: '0.9.0' });
    if (path === '/api/pull') return json(200, { status: 'success' });
    if (path === '/api/tags') return json(200, {
      models: [{ name: 'qwen3:14b' }, { name: 'wizard-vicuna-uncensored:13b' }],
    });
    if (path === '/api/chat') return json(200, { done: true });
    if (path === '/api/delete') throw new Error('Model deletion is forbidden by default');
    throw new Error('unexpected request ' + path);
  };
  const result = await syncOllamaExclusiveModel({
    baseUrl: 'http://127.0.0.1:11434',
    targetModel: 'wizard-vicuna-uncensored:13b',
    fetchImpl: fakeFetch,
  });
  assert.equal(result.ok, true);
  assert.equal(result.connected, true);
  assert.deepEqual(result.removedModels, []);
  assert.deepEqual(result.keptModels, ['qwen3:14b', 'wizard-vicuna-uncensored:13b']);
  assert.equal(calls.some(c => c.path === '/api/delete'), false);
});
