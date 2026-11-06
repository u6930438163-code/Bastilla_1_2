import assert from 'node:assert/strict';
import test from 'node:test';
import { selectChatProviderConfig } from '../src/kernel/chatProviderMode.ts';
import { configuredProviders, generateWithChain, LlmChainError } from '../src/kernel/llmChain.ts';

const mockResponse = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const allConfigured = {
  providers: ['gemini', 'ollama', 'xai'],
  geminiApiKey: 'test-g',
  geminiModel: 'test-gemini',
  xaiApiKey: 'test-x',
  xaiModel: 'test-xai',
  ollamaModel: 'test-ollama',
  ollamaBaseUrl: 'http://127.0.0.1:11434',
};
const input = { system: 'System', history: [], message: 'Hello' };

test('operator API mode never selects an Ollama provider', () => {
  const selected = selectChatProviderConfig(allConfigured, 'api');
  assert.deepEqual(configuredProviders(selected), ['gemini', 'xai']);
  assert.deepEqual(allConfigured.providers, ['gemini', 'ollama', 'xai'], 'source config stays unchanged');
});

test('operator Ollama mode never selects API providers', () => {
  const selected = selectChatProviderConfig(allConfigured, 'ollama');
  assert.deepEqual(configuredProviders(selected), ['ollama']);
});

test('explicit API mode errors without API keys rather than silently using Ollama', () => {
  const noApi = selectChatProviderConfig({
    providers: ['ollama'], ollamaModel: 'test-ollama',
  }, 'api');
  assert.deepEqual(noApi.providers, []);
  assert.deepEqual(configuredProviders(noApi), [], 'explicitly empty provider list never discovers Ollama');
});

test('selected Ollama uses only Ollama even with configured API keys', async () => {
  const calls = [];
  const selected = selectChatProviderConfig({
    ...allConfigured,
    fetchImpl: async url => {
      calls.push(String(url));
      if (!String(url).includes('/api/chat')) throw new Error('unexpected API request');
      return mockResponse(200, { message: { role: 'assistant', content: 'Z Ollamy' } });
    },
  }, 'ollama');
  const response = await generateWithChain(selected, input);
  assert.equal(response.provider, 'ollama');
  assert.deepEqual(calls.every(url => url.includes('/api/chat')), true);
});

test('selected API mode never falls back to Ollama after cloud failure', async () => {
  const calls = [];
  const selected = selectChatProviderConfig({
    ...allConfigured,
    fetchImpl: async url => {
      calls.push(String(url));
      return mockResponse(503, { error: 'unavailable' });
    },
  }, 'api');
  await assert.rejects(generateWithChain(selected, input), LlmChainError);
  assert.equal(calls.some(url => url.includes('/api/chat')), false);
});
