import assert from 'node:assert/strict';
import test from 'node:test';
import { generateWithChain } from '../src/kernel/llmChain.ts';

test('Ollama streams genuine NDJSON tokens in order and hides think blocks', async () => {
  const lines = [
    { message: { content: 'Cześć ' }, done: false },
    { message: { content: '<thi' }, done: false },
    { message: { content: 'nk>prywatny tok myślenia' }, done: false },
    { message: { content: '</think>' }, done: false },
    { message: { content: 'świecie!' }, done: false },
    { done: true },
  ].map(item => JSON.stringify(item) + '\n');
  const body = lines.join('');
  const bytes = new TextEncoder().encode(body);
  const segments = [bytes.subarray(0, 7), bytes.subarray(7, 35), bytes.subarray(35)];
  const seen = [];
  const fetchImpl = async (url, init) => {
    assert.match(String(url), /\/api\/chat$/);
    const sent = JSON.parse(init.body);
    assert.equal(sent.stream, true);
    assert.equal(sent.think, false);
    let i = 0;
    return new Response(new ReadableStream({
      pull(controller) {
        if (i < segments.length) controller.enqueue(segments[i++]);
        else controller.close();
      },
    }), { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
  };
  const result = await generateWithChain(
    { providers: ['ollama'], ollamaModel: 'test-model', fetchImpl },
    { system: 'Test', history: [], message: 'Cześć' },
    undefined,
    fragment => seen.push(fragment),
  );
  assert.equal(result.provider, 'ollama');
  assert.equal(result.text, 'Cześć świecie!');
  assert.equal(seen.join(''), 'Cześć świecie!');
  assert.ok(seen.length >= 2, 'visible answer arrived in multiple genuine chunks');
  assert.equal(seen.join('').includes('prywatny'), false);
});
