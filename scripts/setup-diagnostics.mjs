#!/usr/bin/env node
/**
 * Bastilla 50 diagnostics: opt-in Debian/Ubuntu APT installation.
 * Dry-run by default; no scans, commands from GitHub, service startups or AI credential changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DIAGNOSTIC_TOOLS, findExecutable } from '../integrations/diagnostics/catalog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE = Object.freeze({
  Glances: 'glances', Sysstat: 'sysstat', strace: 'strace',
  Smartmontools: 'smartmontools', 'NVMe CLI': 'nvme-cli',
  'lm-sensors': 'lm-sensors', MTR: 'mtr-tiny', tcpdump: 'tcpdump',
  Nmap: 'nmap', GoAccess: 'goaccess', HTTPie: 'httpie',
  Lynis: 'lynis', lnav: 'lnav',
});
const EXPANDED = Object.freeze({
  bpftrace: 'bpftrace', FIO: 'fio', iperf3: 'iperf3',
  'testssl.sh': 'testssl.sh', AIDE: 'aide',
  OpenSCAP: 'openscap-scanner', pg_activity: 'pg-activity',
  pgBadger: 'pgbadger',
  'ssh-audit': 'ssh-audit', MySQLTuner: 'mysqltuner', ClamAV: 'clamav',
});
export const INSTALL_MAP = Object.freeze({ ...CORE, ...EXPANDED });

export function selectDiagnosticTools({ profile = 'core', names = [] } = {}) {
  if (!['core', 'expanded'].includes(profile)) throw new Error('Nieznany profil: ' + profile);
  const catalog = new Map(DIAGNOSTIC_TOOLS.map(tool => [tool.name.toLowerCase(), tool]));
  const selected = names.length ? names.map(name => {
    const tool = catalog.get(name.toLowerCase());
    if (!tool) throw new Error('Nieznane narzędzie: ' + name);
    return tool;
  }) : DIAGNOSTIC_TOOLS;
  return selected.map(tool => {
    const pkg = INSTALL_MAP[tool.name] || null;
    const eligible = Boolean(pkg && (names.length || profile === 'expanded' || Object.hasOwn(CORE, tool.name)));
    return { name: tool.name, github: tool.github, category: tool.category,
      agent: tool.agent, binary: tool.binary, aptPackage: pkg,
      eligible, method: eligible ? 'debian-apt' : pkg ? 'expanded-profile' : 'manual' };
  });
}
export function parseOptions(argv) {
  const opts = { apply: false, profile: 'core', names: [], json: false, update: true, report: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--apply') opts.apply = true;
    else if (flag === '--plan') opts.apply = false;
    else if (flag === '--json') opts.json = true;
    else if (flag === '--no-update') opts.update = false;
    else if (['--profile', '--tool', '--report'].includes(flag)) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error('Brak wartości dla ' + flag);
      if (flag === '--profile') opts.profile = value;
      else if (flag === '--tool') opts.names.push(value);
      else opts.report = value;
    } else if (flag === '--help' || flag === '-h') opts.help = true;
    else throw new Error('Nieznany parametr: ' + flag);
  }
  return opts;
}
const HELP = [
  'Bastilla 50 diagnostics — instalator APT dla Debian/Ubuntu',
  'Plan: npm run setup:diagnostics',
  'Instaluj podstawowe: npm run setup:diagnostics -- --apply',
  'Instaluj rozszerzone: npm run setup:diagnostics -- --apply --profile expanded',
  'Wybrane: npm run setup:diagnostics -- --apply --tool Nmap',
  'Opcje: --plan, --json, --no-update, --report PLIK, --help',
].join('\n');
function command(binary, args, { inherit = false, environment = {} } = {}) {
  const r = spawnSync(binary, args, {
    encoding: 'utf8', timeout: 180000, maxBuffer: 1048576,
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...environment },
  });
  return { ok: r.status === 0 && !r.error,
    stdout: (r.stdout || '').trim(), code: r.status, error: r.error?.message };
}
function apt(args) {
  const env = { DEBIAN_FRONTEND: 'noninteractive' };
  if (process.getuid?.() === 0) return command('apt-get', args, { inherit: true, environment: env });
  return command('sudo', ['apt-get', ...args], { inherit: true, environment: env });
}
function isDebianFamily() {
  try {
    const release = fs.readFileSync('/etc/os-release', 'utf8').replaceAll('"', '');
    return /^(ID=(debian|ubuntu)|ID_LIKE=.*debian)/m.test(release);
  } catch { return false; }
}
function packageInstalled(pkg) {
  return command('dpkg-query', ['-W', '-f=' + '$' + '{Status}', pkg]).stdout === 'install ok installed';
}
function packageCandidate(pkg) {
  return command('apt-cache', ['show', '--no-all-versions', pkg]).ok;
}
/**
 * APT simulates changes without root. Never allow automatic package removals.
 * Error text is not included in the UI reports because it may contain host details.
 */
export function isSafeAptSimulation(result) {
  return Boolean(result && result.ok &&
    !/^(?:Remv|Purg)\s/m.test(result.stdout || '') &&
    !/^(?:Remv|Purg)\s/m.test(result.stderr || ''));
}
export function buildPlan({ profile = 'core', names = [], distroSupported = true,
  installed = () => false, candidate = () => false, executable = () => false } = {}) {
  return selectDiagnosticTools({ profile, names }).map(tool => {
    const inPath = Boolean(tool.binary && executable(tool.binary));
    const aptInstalled = Boolean(tool.aptPackage && installed(tool.aptPackage));
    const aptAvailable = Boolean(tool.eligible && distroSupported && (aptInstalled || candidate(tool.aptPackage)));
    const status = inPath ? 'in-path' : aptInstalled ? 'apt-installed' :
      !tool.eligible ? (tool.method === 'manual' ? 'manual' : 'expanded-only') :
      !distroSupported ? 'unsupported-distro' : aptAvailable ? 'ready-to-install' : 'not-in-apt';
    return { ...tool, inPath, aptInstalled, aptAvailable, status };
  });
}
function saveReport(location, report) {
  const filename = path.resolve(location || path.join(ROOT, 'data', 'diagnostics-install-report.json'));
  if (filename === ROOT || filename === '/') throw new Error('Nieprawidłowy plik raportu');
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(filename, 0o600);
}
export function main(argv = process.argv.slice(2)) {
  const opts = parseOptions(argv);
  if (opts.help) { process.stdout.write(HELP + '\n'); return 0; }
  selectDiagnosticTools(opts); // Validate input before changes.
  const supported = isDebianFamily();
  if (opts.apply && !supported) {
    process.stderr.write('Wymagany Debian/Ubuntu; bez zmian.\n');
    return 2;
  }
  const missingSelected = selectDiagnosticTools(opts).some(t => t.eligible && !packageInstalled(t.aptPackage));
  if (opts.apply && opts.update && missingSelected) {
    process.stderr.write('Odświeżam indeks APT...\n');
    if (!apt(['update']).ok) {
      process.stderr.write('Błąd apt-get update. Instalacja wstrzymana.\n');
      return 2;
    }
  }
  const getPlan = () => buildPlan({ profile: opts.profile, names: opts.names,
    distroSupported: supported, installed: packageInstalled,
    candidate: packageCandidate, executable: findExecutable });
  let rows = getPlan();
  const failures = [];
  if (opts.apply) {
    for (const row of rows) {
      if (row.status !== 'ready-to-install') continue;
      const simulation = command('apt-get', ['--simulate', '--no-install-recommends', 'install', row.aptPackage]);
      if (!isSafeAptSimulation(simulation)) {
        process.stderr.write('Pomijam ' + row.name + ': nieudana lub ryzykowna symulacja APT.\n');
        failures.push({ name: row.name, package: row.aptPackage,
          stage: 'apt-simulate', reason: 'simulation-failed-or-package-removal' });
        continue;
      }
      process.stderr.write('Instaluję ' + row.name + ' (' + row.aptPackage + ')...\n');
      const result = apt(['install', '--yes', '--no-install-recommends', row.aptPackage]);
      if (!result.ok) failures.push({ name: row.name, package: row.aptPackage,
        stage: 'apt-install', code: result.code, error: result.error || null });
    }
    rows = getPlan();
  }
  const summary = { catalog: DIAGNOSTIC_TOOLS.length, selected: rows.length,
    inPath: rows.filter(x => x.inPath).length,
    aptInstalled: rows.filter(x => x.aptInstalled).length,
    readyToInstall: rows.filter(x => x.status === 'ready-to-install').length,
    manualOrUnsupported: rows.filter(x => ['manual', 'expanded-only', 'not-in-apt', 'unsupported-distro'].includes(x.status)).length,
    failed: failures.length };
  const report = { mode: opts.apply ? 'apply' : 'plan', profile: opts.profile,
    generatedAt: new Date().toISOString(), distroSupported: supported,
    notes: ['APT tylko z aktywnych repozytoriów systemu; brak skanów lub uruchamiania narzędzi diagnostycznych.',
      'Najpierw apt --simulate; każda planowana operacja usuwania pakietów blokuje instalację. Skrypty postinstalacyjne APT mogą uruchomić usługi.',
      'Pozostałe narzędzia i usługi wymagają osobnego wdrożenia.',
      'W PATH oznacza obecność pliku, nie poprawne działanie usługi.'],
    summary, failures, tools: rows };
  // Dry run never writes by default; --report opts in.
  if (opts.apply || opts.report) {
    try { saveReport(opts.report, report); }
    catch (err) { process.stderr.write('Błąd zapisu raportu: ' + err.message + '\n'); return 2; }
  }
  if (opts.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  else {
    process.stdout.write('Bastilla diagnostics: ' + report.mode + ' / ' + opts.profile + '\n');
    process.stdout.write('Katalog ' + summary.catalog + ', PATH ' + summary.inPath +
      ', APT ' + summary.aptInstalled + ', do instalacji ' + summary.readyToInstall +
      ', osobne ' + summary.manualOrUnsupported + ', błędy ' + summary.failed + '\n');
    for (const row of rows) process.stdout.write(row.name + ': ' + row.status +
      (row.aptPackage ? ' [' + row.aptPackage + ']' : '') + '\n');
  }
  return failures.length ? 1 : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); }
  catch (err) { process.stderr.write(err.message + '\n' + HELP + '\n'); process.exitCode = 2; }
}
