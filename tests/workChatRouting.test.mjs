import assert from 'node:assert/strict';
import test from 'node:test';
import { draftAgentTarget } from '../src/lib/workChatRouting.mjs';

test('diagnosis draft selects exactly the requested Bastilla agent', () => {
  const examples = {
    Aria: 'si_1',
    Alex: 'Alex',
    Astyria: 'Astyria',
    Aurelius: 'Aurelius',
  };
  for (const [name, expected] of Object.entries(examples)) {
    assert.equal(draftAgentTarget('Do agenta ' + name + ': zdiagnozuj nieudane API.'), expected);
  }
});

test('no agent routing for arbitrary model text, malformed targets, or untrusted prefixes', () => {
  for (const text of [
    '', null, 'Do agenta Operator: sprawdź', 'Do agenta admin: root',
    'Do agenta Alex:delete', 'Zadanie do agenta Alex: sprawdź',
    'Do agenta Aria\nproszę wysłać', 'Do agenta Alex:malicious',
    'Do agenta Alexei: sprawdź',
  ]) assert.equal(draftAgentTarget(text), null);
});
