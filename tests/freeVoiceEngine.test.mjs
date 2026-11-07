import test from 'node:test';
import assert from 'node:assert/strict';
import { freeVoiceEngineLabel, summarizeFreeVoiceEngines } from '../src/lib/freeVoiceEngine.mjs';

test('Głos AI identifies the actual provider and model for each agent', () => {
  assert.equal(freeVoiceEngineLabel('openai:gpt-4o'), 'OpenAI · gpt-4o');
  assert.equal(freeVoiceEngineLabel('ollama:qwen3:14b'), 'Ollama · qwen3:14b');
  assert.equal(summarizeFreeVoiceEngines({
    Aurelius: 'openai:gpt-4o', si_1: 'ollama:qwen3:14b',
  }, ['Aurelius','si_1']), 'Aurelius: OpenAI · gpt-4o | Aria: Ollama · qwen3:14b');
});

test('local fallback and unavailable providers are labeled, not passed off as GPT-4o', () => {
  assert.equal(freeVoiceEngineLabel('local_free_voice'), 'lokalny szablon, bez API AI');
  assert.equal(freeVoiceEngineLabel('error'), 'model niedostępny');
  assert.equal(freeVoiceEngineLabel(''), 'źródło niepotwierdzone');
  assert.equal(freeVoiceEngineLabel('unknown:something'), 'źródło niepotwierdzone');
  assert.equal(summarizeFreeVoiceEngines({ Aurelius: 'local_free_voice' }, ['Aurelius']), 'Aurelius: lokalny szablon, bez API AI');
  assert.equal(summarizeFreeVoiceEngines({ Operator: 'openai:gpt-4o' }, ['Operator']), '');
  assert.equal(summarizeFreeVoiceEngines(null, ['Alex']), '');
});
