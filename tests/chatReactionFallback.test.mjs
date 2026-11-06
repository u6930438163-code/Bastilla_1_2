import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPendingReactionVotes, mergePendingReactionVotes, nextOperatorReaction } from '../src/lib/chatReactionFallback.mjs';

const key = 'm_abc_0';

test('offline selections are restored, validated, and show only genuine voters', () => {
  const storage = { getItem: () => JSON.stringify({ [key]: 'up', 'm_invalid_999999999': 'down', 'bad': 'up' }) };
  const pending = loadPendingReactionVotes(storage, 'reactions');
  assert.deepEqual(pending, { [key]: 'up' });
  assert.deepEqual(mergePendingReactionVotes({ [key]: { Aria: 'down' } }, pending),
    { [key]: { Aria: 'down', Operator: 'up' } });
  assert.deepEqual(mergePendingReactionVotes({ [key]: { Alex: 'up', Operator: 'down' } }, { [key]: null }),
    { [key]: { Alex: 'up' } });
  assert.deepEqual(loadPendingReactionVotes({ getItem: () => '{not-json' }, 'reactions'), {});
  assert.equal(nextOperatorReaction('up', 'up'), null);
  assert.equal(nextOperatorReaction('down', 'up'), 'up');
});
