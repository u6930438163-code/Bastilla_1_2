import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const WORKER_NAMES = Object.freeze(['Aria','Alex','Astyria','Aurelius']);
const REQUIRED = Object.freeze([
  'BASTILLA_LIVE_CHAT_AGENT',
  'BASTILLA_LIVE_CHAT_BASE_URL',
  'BASTILLA_LIVE_CHAT_WORKER_TOKEN',
  'BASTILLA_AGENT_ADAPTER',
]);

// Static parser only. Never source the env file or execute its contents.
export function parseWorkerConfig(contents) {
  const env = {};
  for (const line of String(contents).split(/\r?\n/)) {
    const matched = line.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)\s*$/);
    if (!matched) continue;
    const key = matched[1];
    let value = matched[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1,-1);
    env[key] = value;
  }
  return env;
}

function endpointAllowed(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    return url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname));
  } catch { return false; }
}
function looksLikePlaceholder(value) {
  return !value || /^(?:uzupelnij|placeholder|your-|change[-_ ]?me|my_|xxx)/i.test(value);
}

// Exposes only boolean flags. Values, addresses and secret bytes NEVER leave the parser.
export function inspectWorkerFile(filename, agent) {
  const result = { agent, configPresent: false, configValid: false, permissionsSafe: false, issues: [] };
  let stat;
  let content;
  try { stat = fs.statSync(filename); content = fs.readFileSync(filename, 'utf8'); }
  catch { result.issues.push('missing-or-unreadable-env'); return result; }
  result.configPresent = stat.isFile();
  if (!result.configPresent) {result.issues.push('not-a-regular-file');return result;}
  // Reject world-readable or writable secrets and group-writable files.
  result.permissionsSafe = process.platform === 'win32' ? false : (stat.mode & 0o027) === 0;
  if (!result.permissionsSafe) result.issues.push('weak-secret-permissions');
  const env = parseWorkerConfig(content);
  for (const key of REQUIRED) {
    if (looksLikePlaceholder(env[key])) result.issues.push('missing-or-placeholder:' + key);
  }
  if (env.BASTILLA_LIVE_CHAT_AGENT !== agent) result.issues.push('agent-identity-mismatch');
  if (!endpointAllowed(env.BASTILLA_LIVE_CHAT_BASE_URL || '')) result.issues.push('invalid-private-base-url');
  if (String(env.BASTILLA_LIVE_CHAT_WORKER_TOKEN || '').length < 32) result.issues.push('worker-token-too-short');
  // Reuse the official original-agent adapter or a real custom adapter.
  if (env.BASTILLA_AGENT_ADAPTER === 'integrations/live-chat/http-agent-adapter.mjs') {
    if (!endpointAllowed(env.BASTILLA_AGENT_ENDPOINT || '')) result.issues.push('invalid-original-agent-endpoint');
    if (String(env.BASTILLA_AGENT_API_KEY || '').length < 32 ||
        looksLikePlaceholder(env.BASTILLA_AGENT_API_KEY)) result.issues.push('missing-original-agent-key');
  }
  result.configValid = result.permissionsSafe && result.issues.length === 0;
  return result;
}

function unitStatus(agent, runner = spawnSync) {
  try {
    const response = runner('systemctl', ['is-active', '--quiet', 'bastilla-agent@' + agent + '.service'], {
      encoding: 'utf8', timeout: 2500, shell: false,
    });
    if (response.error) return 'unknown';
    return response.status === 0 ? 'active' : 'inactive';
  } catch { return 'unknown'; }
}

export function getWorkerPreflight({
  configDirectory = '/etc/bastilla/live-chat',
  runner = spawnSync,
} = {}) {
  const workers = WORKER_NAMES.map(agent => {
    const checked = inspectWorkerFile(path.join(configDirectory, agent + '.env'), agent);
    const service = unitStatus(agent, runner);
    return { ...checked, service };
  });
  return {
    source: 'local-host-preflight', generatedAt: new Date().toISOString(),
    configReady: workers.every(w => w.configValid),
    servicesActive: workers.every(w => w.service === 'active'),
    workers,
    note: 'Aktywna usługa systemd nie dowodzi poprawnego działania modelu AI. Nie odczytano API modelu ani nie wysłano heartbeat.',
  };
}

const launchedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (launchedDirectly) {
  const result = getWorkerPreflight();
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    for (const worker of result.workers) {
      process.stdout.write(
        worker.agent + ': config=' + (worker.configValid ? 'OK' : 'INCOMPLETE') +
        ' service=' + worker.service +
        ' issues=' + (worker.issues.join(',') || 'none') + '\n'
      );
    }
    process.stdout.write('Configuration: ' + (result.configReady ? 'READY' : 'INCOMPLETE') +
      '; systemd: ' + (result.servicesActive ? 'ALL ACTIVE' : 'NOT CONFIRMED') + '\n');
    process.stdout.write(result.note + '\n');
  }
  if (!result.configReady || !result.servicesActive) process.exitCode = 1;
}
