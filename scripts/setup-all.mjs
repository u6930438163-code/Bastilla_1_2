#!/usr/bin/env node
/**
 * Bastilla deployment orchestrator. Read-only by default.
 * --apply runs local checks/build only; package installation and secrets remain opt-in.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const allowed = new Set(['--plan', '--apply', '--json', '--help']);
if (args.some(arg => !allowed.has(arg)) || (args.includes('--plan') && args.includes('--apply'))) {
  console.error('Użycie: node scripts/setup-all.mjs [--plan|--apply] [--json]');
  process.exit(2);
}
if (args.includes('--help')) {
  console.log('Plan (bez zmian): npm run setup:all\nWeryfikacja lokalna: npm run setup:all -- --apply\nRaport JSON: npm run setup:all -- --json');
  process.exit(0);
}
const apply = args.includes('--apply');
const json = args.includes('--json');
const tasks = [
  { id: 'dependencies', label: 'Zależności npm', command: ['npm', ['ci', '--ignore-scripts']], automatic: false, note: 'Instalacja zależności wymaga jawnej zgody i dostępu do sieci.' },
  { id: 'typescript', label: 'Kontrola TypeScript', command: ['npm', ['run', 'lint']], automatic: true, requires: 'node_modules' },
  { id: 'tests', label: 'Testy automatyczne', command: ['npm', ['test']], automatic: true, requires: 'node_modules' },
  { id: 'build', label: 'Budowa interfejsu', command: ['npm', ['run', 'build']], automatic: true, requires: 'node_modules' },
  { id: 'api', label: 'Kontrola endpointów API', command: ['npm', ['run', 'check:api']], automatic: false, note: 'Wymaga uruchomionego serwera; nie uruchamiamy usług automatycznie.' },
  { id: 'workers', label: 'Kontrola workerów agentów', command: ['npm', ['run', 'check:workers']], automatic: false, note: 'Wymaga uruchomionych workerów.' },
  { id: 'ollama', label: 'Instalacja Ollama', command: ['npm', ['run', 'setup:ollama']], automatic: false, note: 'Może instalować oprogramowanie i pobierać duże modele.' },
  { id: 'diagnostics', label: 'Plan narzędzi diagnostycznych', command: ['npm', ['run', 'setup:diagnostics']], automatic: true },
  { id: 'mcp', label: 'Serwer MCP', command: ['npm', ['run', 'start:mcp']], automatic: false, note: 'Uruchomienie usługi wymaga osobnej konfiguracji.' },
  { id: 'openai', label: 'OpenAI API', automatic: false, note: 'Sekret OPENAI_CHAT_API_KEY musi zostać ustawiony poza repozytorium.' },
  { id: 'without_nlp', label: 'WITHOUT_NLP', automatic: false, note: 'Weryfikacja modułu Python i endpointów wymaga osobnego testu.' },
];
const results = tasks.map(task => {
  const entry = { id: task.id, label: task.label, status: 'manual', note: task.note || '' };
  if (!apply) {
    entry.status = task.automatic ? 'planned' : 'manual';
    return entry;
  }
  if (!task.automatic) return entry;
  if (task.requires && !existsSync(path.join(root, task.requires))) {
    entry.status = 'blocked';
    entry.note = 'Brak node_modules; najpierw uruchom npm ci świadomie.';
    return entry;
  }
  const result = spawnSync(task.command[0], task.command[1], {
    cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  entry.status = result.status === 0 && !result.error ? 'passed' : 'failed';
  entry.exitCode = result.status;
  entry.note = result.error?.message || (entry.status === 'failed' ? 'Sprawdź lokalne logi polecenia.' : '');
  if (!json) {
    if (result.stdout) process.stdout.write(result.stdout.slice(-6000));
    if (result.stderr) process.stderr.write(result.stderr.slice(-3000));
  }
  return entry;
});
const report = { project: 'Bastilla_1_2', mode: apply ? 'local-verification' : 'plan', results };
if (json) console.log(JSON.stringify(report, null, 2));
else for (const row of results) console.log(row.id + ': ' + row.status + (row.note ? ' — ' + row.note : ''));
if (results.some(row => row.status === 'failed' || row.status === 'blocked')) process.exitCode = 1;
