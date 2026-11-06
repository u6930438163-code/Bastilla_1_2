import test from 'node:test';
import assert from 'node:assert/strict';
import { DIAGNOSTIC_TOOLS } from '../integrations/diagnostics/catalog.mjs';
import { INSTALL_MAP, selectDiagnosticTools, parseOptions, buildPlan, isSafeAptSimulation } from '../scripts/setup-diagnostics.mjs';

test('installer always covers the same 50 catalog entries', () => {
  const plan = selectDiagnosticTools();
  assert.equal(plan.length, 50);
  assert.equal(new Set(plan.map(t => t.name)).size, 50);
  assert.equal(plan.filter(t => t.eligible).length, 13);
  assert.equal(Object.keys(INSTALL_MAP).length, 24);
  assert.equal(DIAGNOSTIC_TOOLS.length, 50);
  for (const name of Object.keys(INSTALL_MAP)) {
    assert.ok(plan.some(t => t.name === name));
    assert.match(INSTALL_MAP[name], /^[a-z0-9.+-]+$/);
  }
});
test('installation only happens with an explicit apply flag', () => {
  assert.equal(parseOptions([]).apply, false);
  assert.equal(parseOptions(['--plan']).apply, false);
  assert.equal(parseOptions(['--apply']).apply, true);
  assert.equal(parseOptions(['--apply', '--plan']).apply, false);
  assert.equal(parseOptions(['--profile', 'expanded', '--no-update']).update, false);
});
test('expanded profile exposes additional apt routes; manual tools remain manual', () => {
  const rows = selectDiagnosticTools({ profile: 'expanded' });
  assert.equal(rows.filter(t => t.eligible).length, 24);
  assert.equal(rows.find(t => t.name === 'Wazuh').method, 'manual');
  assert.equal(rows.find(t => t.name === 'bpftrace').method, 'debian-apt');
  assert.equal(selectDiagnosticTools({ names: ['Trivy'] })[0].method, 'manual');
});
test('unknown names and invalid parameters fail before changing the system', () => {
  assert.throws(() => selectDiagnosticTools({ names: ['not-a-tool'] }), /Nieznane narzędzie/);
  assert.throws(() => selectDiagnosticTools({ profile: 'all' }), /Nieznany profil/);
  assert.throws(() => parseOptions(['--unknown']), /Nieznany parametr/);
  assert.throws(() => parseOptions(['--report']), /Brak wartości/);
});
test('planning is read-only and separates installed from missing', () => {
  const rows = buildPlan({
    names: ['Nmap', 'Glances', 'Wazuh'], installed: p => p === 'nmap',
    candidate: p => p === 'glances', executable: b => b === 'nmap',
  });
  assert.deepEqual(rows.map(x => x.status), ['in-path', 'ready-to-install', 'manual']);
  assert.equal(rows[0].aptInstalled, true);
});
test('unsupported distro cannot be marked ready for installation', () => {
  const row = buildPlan({ names: ['Nmap'], distroSupported: false, candidate: () => true })[0];
  assert.equal(row.status, 'unsupported-distro');
});

test('three additional Debian diagnostic tools are in the expanded profile', () => {
  const tools = selectDiagnosticTools({ profile: 'expanded' });
  const byName = new Map(tools.map(tool => [tool.name, tool]));
  assert.equal(byName.get('ssh-audit').aptPackage, 'ssh-audit');
  assert.equal(byName.get('MySQLTuner').aptPackage, 'mysqltuner');
  assert.equal(byName.get('ClamAV').aptPackage, 'clamav');
  for (const name of ['ssh-audit', 'MySQLTuner', 'ClamAV'])
    assert.equal(byName.get(name).eligible, true);
});
test('APT simulation rejects removal, purge and simulation failure', () => {
  assert.equal(isSafeAptSimulation({ ok: true, stdout: 'Inst nmap (1.0)\nConf nmap (1.0)' }), true);
  assert.equal(isSafeAptSimulation({ ok: true, stdout: 'Remv openssh-server [1.0]' }), false);
  assert.equal(isSafeAptSimulation({ ok: true, stdout: 'Purg iptables [1.0]' }), false);
  assert.equal(isSafeAptSimulation({ ok: false, stdout: '' }), false);
});
