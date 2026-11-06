import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/check-librechat.mjs', import.meta.url));
const example = [
  'BASTILLA_API_BASE_URL=http://host.docker.internal:3000',
  'BASTILLA_LIVE_CHAT_ALLOWED_ORIGIN=http://localhost:3000',
  'BASTILLA_LIVE_CHAT_USER_PASSWORD=test-only-strong-password',
  'BASTILLA_BRIDGE_API_KEY=' + 'k'.repeat(48),
  'BASTILLA_LIBRECHAT_OWNER_EMAIL=owner@example.test',
].join('\n');

function run(t, text) {
  const directory = mkdtempSync(join(tmpdir(), 'bastilla-preflight-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'config.env');
  writeFileSync(path, text);
  // Avoid allowing the CI or developer machine's real Bastilla secrets into tests.
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => !name.startsWith('BASTILLA_')));
  return spawnSync(process.execPath, [script], {
    env: { ...env, BASTILLA_LIBRECHAT_ENV_FILE: path },
    encoding: 'utf8',
  });
}

test('LibreChat deployment preflight accepts local configuration without printing secrets', t => {
  const result = run(t, example);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /configuration valid/);
  assert.doesNotMatch(result.stdout + result.stderr, /test-only-strong-password/);
  assert.doesNotMatch(result.stdout + result.stderr, /k{32}/);
});

test('LibreChat deployment preflight rejects missing configuration', t => {
  const result = run(t, '');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /BASTILLA_BRIDGE_API_KEY: not configured/);
  assert.match(result.stderr, /BASTILLA_LIBRECHAT_OWNER_EMAIL: not configured/);
});

test('LibreChat deployment preflight rejects insecure remote URLs', t => {
  const result = run(t, example.replace(
    'http://host.docker.internal:3000',
    'http://example.com:3000',
  ));
  assert.equal(result.status, 2);
  assert.match(result.stderr, /HTTPS origin/);
});
