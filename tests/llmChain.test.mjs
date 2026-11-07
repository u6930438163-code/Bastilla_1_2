import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LlmChainError,
  configuredProviders,
  generateWithChain,
  resetOllamaModelCache,
  pickOllamaChatModel,
  parseKeepAlive,
  warmupOllama,
  stripThinking,
} from '../src/kernel/llmChain.ts';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});
function mockFetch(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: String(url), body, headers: init.headers });
    for (const [pattern, handler] of routes) {
      if (pattern.test(String(url)) && (!handler.when || handler.when(body))) {
        return handler.respond(body);
      }
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  return { impl, calls };
}

const request = {
  system: 'Jesteś Astyrią.',
  history: [
    { role: 'user', text: 'Cześć' },
    { role: 'assistant', text: 'Witaj, Tato.' },
  ],
  message: 'Co myślisz o muzyce Chopina?',
};

const ollamaOk = (content) => json(200, { message: { role: 'assistant', content } });

test('Ollama odpowiada i usuwa bloki rozumowania', async () => {
  const { impl, calls } = mockFetch([
    [/127\.0\.0\.1:11434\/api\/chat/, { respond: () => ollamaOk('<think>rozważam</think>Lokalna Astyria odpowiada.') }],
  ]);
  const result = await generateWithChain({
    providers: ['ollama'], ollamaModel: 'gemma4:e4b', fetchImpl: impl,
  }, request);
  assert.equal(result.provider, 'ollama');
  assert.equal(result.model, 'gemma4:e4b');
  assert.equal(result.text, 'Lokalna Astyria odpowiada.');
  assert.equal(result.failures.length, 0);
  const call = calls.find((c) => c.url.includes('11434'));
  assert.equal(call.body.stream, false);
  assert.equal(call.body.think, false);
  assert.ok(call.body.options.num_predict <= 3072);
  assert.deepEqual(call.body.messages.map((m) => m.role), ['system', 'user', 'assistant', 'user']);
});

test('Ollama bez obsługi think → ponowienie bez tej opcji; brak modelu → podpowiedź pull', async () => {
  const { impl, calls } = mockFetch([
    [/api\/chat/, { when: (b) => b.think === false, respond: () => json(400, { error: 'model does not support thinking' }) }],
    [/api\/chat/, { respond: () => ollamaOk('Działa bez think.') }],
  ]);
  const result = await generateWithChain({ ollamaModel: 'qwen3.5:4b', fetchImpl: impl }, request);
  assert.equal(result.text, 'Działa bez think.');
  assert.equal(calls.length, 2);

  const missing = mockFetch([[/api\/chat/, { respond: () => json(404, { error: 'model not found' }) }]]);
  await assert.rejects(
    generateWithChain({ ollamaModel: 'gemma4:12b', fetchImpl: missing.impl }, request),
    (error) => error instanceof LlmChainError && /ollama pull gemma4:12b/.test(error.failures[0]),
  );

  const down = mockFetch([[/api\/chat/, { respond: () => { throw new TypeError('fetch failed'); } }]]);
  await assert.rejects(
    generateWithChain({ ollamaModel: 'gemma4:12b', fetchImpl: down.impl }, request),
    (error) => error instanceof LlmChainError && /ollama serve/.test(error.failures[0]),
  );
});

test('Ollama HTTP 500 includes provider details', async () => {
  const { impl } = mockFetch([
    [/api\/chat/, { respond: () => json(500, { error: 'model requires more system memory than is available' }) }],
  ]);
  await assert.rejects(
    generateWithChain({ providers: ['ollama'], ollamaModel: 'llama3.2-vision:11b', fetchImpl: impl }, request),
    (error) => error instanceof LlmChainError
      && /Ollama: HTTP 500\. \[llama3\.2-vision:11b\] Szczegóły: model requires more system memory than is available/.test(error.failures[0]),
  );
});

test('kolejność z Ollamą i usuwanie bloków rozumowania', () => {
  assert.deepEqual(configuredProviders({ providers: ['ollama'], ollamaModel: 'm' }), ['ollama']);
  assert.deepEqual(configuredProviders({ ollamaModel: 'm' }), ['ollama']);
  assert.equal(stripThinking('<think>a\nb</think>\nOdpowiedź'), 'Odpowiedź');
  assert.equal(stripThinking('bez myślenia'), 'bez myślenia');
});

test('Ollama wykrywa skonfigurowany model z /api/tags', async () => {
  resetOllamaModelCache();
  const { impl, calls } = mockFetch([
    [/api\/tags/, { respond: () => json(200, { models: [
      { name: 'nomic-embed-text:latest', size: 300 },
      { name: 'qwen3.5:4b', size: 3_300_000_000 },
      { name: 'qwen3.5:2b', size: 1_900_000_000 },
    ] }) }],
    [/api\/chat/, { respond: (body) => ollamaOk(`Odpowiada ${body.model}.`) }],
  ]);
  const config = { providers: ['ollama'], ollamaModel: 'auto', fetchImpl: impl };
  assert.deepEqual(configuredProviders(config), ['ollama']);
  const result = await generateWithChain(config, request);
  assert.equal(result.provider, 'ollama');
  assert.equal(result.model, 'qwen3.5:4b');
  await generateWithChain(config, request);
  assert.equal(calls.filter((call) => call.url.includes('/api/tags')).length, 1, 'model wykrywany raz (cache)');
});

test('tylko Ollama bez pobranych modeli → czytelny błąd', async () => {
  resetOllamaModelCache();
  const { impl } = mockFetch([[/api\/tags/, { respond: () => json(200, { models: [] }) }]]);
  await assert.rejects(
    generateWithChain({ providers: ['ollama'], fetchImpl: impl }, request),
    (error) => error instanceof LlmChainError && /npm run setup:ollama/.test(error.failures[0]),
  );
  assert.equal(pickOllamaChatModel([{ name: 'bge-m3' }]), null);
});

test('Ollama: keep_alive, num_ctx i num_thread trafiają do żądania', async () => {
  const { impl, calls } = mockFetch([[/api\/chat/, { respond: () => ollamaOk('ok') }]]);
  await generateWithChain({ providers: ['ollama'], ollamaModel: 'm', ollamaNumThread: 4, fetchImpl: impl }, request);
  const body = calls[0].body;
  assert.equal(body.keep_alive, '24h');
  assert.equal(body.options.num_ctx, 2048);
  assert.equal(body.options.num_thread, 4);
  assert.equal(body.options.num_predict, 3072);
  const custom = mockFetch([[/api\/chat/, { respond: () => ollamaOk('ok') }]]);
  await generateWithChain({ providers: ['ollama'], ollamaModel: 'm', ollamaKeepAlive: '-1', ollamaNumCtx: 2048, ollamaNumPredict: 512, fetchImpl: custom.impl }, request);
  assert.equal(custom.calls[0].body.keep_alive, -1);
  assert.equal(custom.calls[0].body.options.num_ctx, 2048);
  assert.equal(custom.calls[0].body.options.num_predict, 512);
  assert.equal('num_thread' in custom.calls[0].body.options, false);

  const lowContext = mockFetch([[/api\/chat/, { respond: () => ollamaOk('ok') }]]);
  await generateWithChain({ providers: ['ollama'], ollamaModel: 'm', ollamaNumCtx: 256, fetchImpl: lowContext.impl }, request);
  assert.equal(lowContext.calls[0].body.options.num_ctx, 512);

  assert.equal(parseKeepAlive('30m'), '30m');
  assert.equal(parseKeepAlive(''), '24h');
});

test('Ollama: zdjęcie przy modelu bez vision → czytelny błąd; z vision → obrazy w żądaniu', async () => {
  resetOllamaModelCache();
  const imageRequest = { ...request, attachments: [{ name: 'foto.jpg', mimeType: 'image/jpeg', content: '/9j/4A==' }] };
  const noVision = mockFetch([
    [/api\/show/, { respond: () => json(200, { capabilities: ['completion', 'tools'] }) }],
  ]);
  await assert.rejects(
    generateWithChain({ providers: ['ollama'], ollamaModel: 'llama3.2:latest', fetchImpl: noVision.impl }, imageRequest),
    (error) => error instanceof LlmChainError && /nie analizuje zdjęć/.test(error.failures[0]),
  );
  resetOllamaModelCache();
  const withVision = mockFetch([
    [/api\/show/, { respond: () => json(200, { capabilities: ['completion', 'vision'] }) }],
    [/api\/chat/, { respond: () => ollamaOk('Widzę zdjęcie.') }],
  ]);
  const result = await generateWithChain({ providers: ['ollama'], ollamaModel: 'gemma3:4b', fetchImpl: withVision.impl }, imageRequest);
  assert.equal(result.text, 'Widzę zdjęcie.');
  const chatCall = withVision.calls.find((call) => call.url.includes('/api/chat'));
  assert.deepEqual(chatCall.body.messages.at(-1).images, ['/9j/4A==']);
  resetOllamaModelCache();
});

test('rozgrzewka Ollamy wczytuje model i nie rzuca przy awarii', async () => {
  resetOllamaModelCache();
  const ok = mockFetch([[/api\/chat/, { respond: () => json(200, { done: true }) }]]);
  const warm = await warmupOllama({ ollamaModel: 'qwen3.5:4b', fetchImpl: ok.impl });
  assert.equal(warm.ok, true);
  assert.deepEqual(ok.calls[0].body.messages, []);
  assert.equal(ok.calls[0].body.keep_alive, '24h');
  const down = mockFetch([[/api\/chat/, { respond: () => { throw new TypeError('fetch failed'); } }]]);
  const failed = await warmupOllama({ ollamaModel: 'qwen3.5:4b', fetchImpl: down.impl });
  assert.equal(failed.ok, false);
});
