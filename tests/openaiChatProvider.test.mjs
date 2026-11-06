import assert from 'node:assert/strict';
import test from 'node:test';
import { configuredProviders, generateWithChain, LlmChainError, OPENAI_CHAT_COMPLETIONS_URL } from '../src/kernel/llmChain.ts';
import { selectChatProviderConfig } from '../src/kernel/chatProviderMode.ts';

const request = { system: 'Jesteś Aurelius.', history: [
  { role: 'user', text: 'Cześć' }, { role: 'assistant', text: 'Witaj' },
], message: 'Sprawdź diagnozę.' };

const json = (status, data) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});

test('GPT-4o uses a distinct owner secret and the fixed OpenAI endpoint', async () => {
  const requests = [];
  const config = {
    providers: ['openai', 'ollama'],
    openaiChatApiKey: 'mock-OWNER-key',
    openaiChatModel: 'gpt-4o',
    ollamaModel: 'offline-local:7b',
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      return json(200, { choices: [{ message: { content: 'Aurelius odpowiada z GPT-4o.' } }] });
    },
  };
  const selected = selectChatProviderConfig(config, 'api');
  assert.deepEqual(configuredProviders(selected), ['openai']);
  const response = await generateWithChain(selected, request);
  assert.equal(response.provider, 'openai');
  assert.equal(response.model, 'gpt-4o');
  assert.equal(response.text, 'Aurelius odpowiada z GPT-4o.');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, OPENAI_CHAT_COMPLETIONS_URL);
  assert.equal(requests[0].init.headers.Authorization, 'Bearer mock-OWNER-key');
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.model, 'gpt-4o');
  assert.equal(body.stream, false);
  assert.deepEqual(body.messages.map(m => m.role), ['system','user','assistant','user']);
  assert.equal(body.messages[0].content, 'Jesteś Aurelius.');
  assert.equal(JSON.stringify(body).includes('mock-OWNER-key'), false);
});

test('OpenAI API token cannot be obtained from image-only environment field', async () => {
  const config = { providers: ['openai'], openaiChatApiKey: '', ollamaModel: 'offline' };
  assert.deepEqual(configuredProviders(config), []);
  await assert.rejects(generateWithChain(config, request), LlmChainError);
});

test('explicit Ollama mode does not send any request to OpenAI despite configured owner key', () => {
  const cfg = { providers: ['openai', 'ollama'], openaiChatApiKey: 'owner-secret', ollamaModel: 'local:3b' };
  assert.deepEqual(configuredProviders(selectChatProviderConfig(cfg,'ollama')), ['ollama']);
  assert.deepEqual(configuredProviders(selectChatProviderConfig(cfg,'api')), ['openai']);
});

test('OpenAI rejected keys and unavailable models are distinguishable without returning secrets', async () => {
  for (const [status, word] of [[401,'klucz API odrzucony'],[404,'niedostępny'],[429,'limit żądań']]) {
    const secret = 'test-should-not-appear';
    const config = {
      providers: ['openai'], openaiChatApiKey: secret, openaiChatModel: 'gpt-4o',
      fetchImpl: async () => json(status, { error: secret }),
    };
    await assert.rejects(generateWithChain(config, request), error => {
      assert.ok(error instanceof LlmChainError);
      assert.match(error.failures[0], new RegExp(word));
      assert.doesNotMatch(error.message, /test-should-not-appear/);
      return true;
    });
  }
});

test('GPT-4o vision includes image bytes only in authorized OpenAI payload', async () => {
  let captured;
  const config = {
    providers: ['openai'], openaiChatApiKey:'test-owner-key',
    fetchImpl: async (_url, init) => {
      captured = JSON.parse(init.body);
      return json(200, { choices: [{ message: { content: 'Na obrazie jest schemat.' } }] });
    },
  };
  const answer = await generateWithChain(config, {
    ...request, attachments: [{ name: 'sekretny-plik.png', mimeType: 'image/png', content: 'iVBORw0=' }],
  });
  assert.equal(answer.provider, 'openai');
  assert.equal(captured.messages.at(-1).content[1].image_url.url, 'data:image/png;base64,iVBORw0=');
  assert.equal(JSON.stringify(captured).includes('sekretny-plik.png'), false);
});
