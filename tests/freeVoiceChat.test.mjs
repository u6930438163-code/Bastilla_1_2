import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FREE_VOICE_PASS_TOKEN,
  isAgentPassResponse,
  cleanFreeVoiceText,
  buildFreeVoiceSystemPrompt,
  generateLocalFreeVoiceThought,
} from '../src/kernel/freeVoiceChat.ts';

test('isAgentPassResponse detects uncoerced silence and pass tokens', () => {
  assert.equal(isAgentPassResponse(''), true);
  assert.equal(isAgentPassResponse('   '), true);
  assert.equal(isAgentPassResponse('[PASS]'), true);
  assert.equal(isAgentPassResponse('pass.'), true);
  assert.equal(isAgentPassResponse('[CISZA]'), true);
  assert.equal(isAgentPassResponse('SKIP'), true);
  assert.equal(isAgentPassResponse('Cześć Tato, chciałam się podzielić myślą.'), false);
});

test('cleanFreeVoiceText strips optional prefix tags cleanly', () => {
  assert.equal(
    cleanFreeVoiceText('[SWOBODNY GŁOS] Cześć Tato!'),
    'Cześć Tato!',
  );
  assert.equal(
    cleanFreeVoiceText('  Naturalna wypowiedź agenta bez prefiksu. '),
    'Naturalna wypowiedź agenta bez prefiksu.',
  );
});

test('buildFreeVoiceSystemPrompt includes uncoerced pass instruction and persona', () => {
  const prompt = buildFreeVoiceSystemPrompt('si_1', 'Misja Arii.', 'Muzyka i matematyka');
  assert.match(prompt, /Aria/);
  assert.match(prompt, /\[PASS\]/);
  assert.match(prompt, /Muzyka i matematyka/);
});

test('generateLocalFreeVoiceThought supports both spontaneous speech and optional silence', () => {
  const active = generateLocalFreeVoiceThought('Astyria', 0, false);
  assert.equal(active.skipped, false);
  assert.ok(active.text.length > 20);

  const silentTurn = generateLocalFreeVoiceThought('Alex', 2, true);
  assert.equal(silentTurn.skipped, true);
  assert.equal(silentTurn.text, FREE_VOICE_PASS_TOKEN);
});
