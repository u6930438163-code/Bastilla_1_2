import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chatReactionKeys, canonicalReactionActor } from '../src/lib/chatReactionKeys.mjs';
import { ChatReactionStore } from '../integrations/reactions/store.mjs';

test('stable message identifiers distinguish repeated messages and normalize Aria / Operator', () => {
  const history = [
    { agent: 'si_1', tekst: 'Zrobione' },
    { agent: 'Aria', tekst: 'Zrobione' },
    { agent: 'Alex', tekst: 'Zrobione' },
    { agent: 'Mateusz Mitek', tekst: 'Sprawdź' },
  ];
  const first = chatReactionKeys(history);
  assert.deepEqual(first, chatReactionKeys(history));
  assert.notEqual(first[0], first[1], 'duplicate messages by same agent are distinct');
  assert.notEqual(first[1], first[2]);
  assert.equal(first.length, 4);
  assert.equal(canonicalReactionActor('si_1'), 'Aria');
  assert.equal(canonicalReactionActor('Mateusz Mitek'), 'Operator');
  assert.match(first[0], /^m_[a-z0-9]+_0$/);
});

test('named up/down votes persist and cannot impersonate actors outside approved set', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'bastilla-reactions-'));
  const file = path.join(folder, 'votes.json');
  try {
    const key = chatReactionKeys([{ agent: 'Alex', tekst: 'Raport diagnostyczny' }])[0];
    const store = new ChatReactionStore(file);
    assert.deepEqual(store.get(key), {});
    store.vote(key, 'Operator', 'up');
    store.vote(key, 'Aria', 'down');
    assert.deepEqual(store.get(key), { Operator: 'up', Aria: 'down' });
    assert.deepEqual(new ChatReactionStore(file).get(key), { Operator: 'up', Aria: 'down' });
    store.vote(key, 'Operator', 'down');
    assert.equal(store.get(key).Operator, 'down');
    store.vote(key, 'Operator', 'down'); // toggle
    assert.equal(store.get(key).Operator, undefined);
    assert.throws(() => store.vote(key, 'Unknown', 'up'), /Nieprawidłowy głos/);
    assert.throws(() => store.vote('wrong-key', 'Aria', 'up'), /Nieprawidłowy głos/);
    assert.equal(new ChatReactionStore(file).get(key).Aria, 'down');
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
