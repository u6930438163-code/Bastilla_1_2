import assert from 'node:assert/strict';
import test from 'node:test';
import {createBuildMetadata} from '../src/lib/buildMetadata.mjs';

test('build metadata includes the package version and full commit SHA', () => {
  const metadata = createBuildMetadata('2.0.0', 'ABCDEF0123456789ABCDEF0123456789ABCDEF01');

  assert.deepEqual(metadata, {
    version: '2.0.0',
    commit: 'abcdef0123456789abcdef0123456789abcdef01',
  });
});

test('build metadata uses explicit unknown values for missing or invalid inputs', () => {
  assert.deepEqual(createBuildMetadata('', 'feature-branch'), {
    version: 'unknown',
    commit: 'unknown',
  });
});

test('build metadata does not attribute a dirty working tree to its previous commit', () => {
  assert.deepEqual(createBuildMetadata('2.0.0', 'abcdef0123456789abcdef0123456789abcdef01', true), {
    version: '2.0.0',
    commit: 'unknown',
  });
});
