import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Curated catalog: one primary specialty per project. Detection only; never execute third-party binaries.
// A PATH match is NOT a successful health check or proof that a service is active.
const ENTRIES = [
  [
    "Glances",
    "nicolargo/glances",
    "glances",
    "System",
    "Aria"
  ],
  [
    "osquery",
    "osquery/osquery",
    "osqueryi",
    "System",
    "Aria"
  ],
  [
    "below",
    "facebookincubator/below",
    "below",
    "System",
    "Aria"
  ],
  [
    "bpftrace",
    "bpftrace/bpftrace",
    "bpftrace",
    "System",
    "Alex"
  ],
  [
    "Sysstat",
    "sysstat/sysstat",
    "sar",
    "System",
    "Aria"
  ],
  [
    "strace",
    "strace/strace",
    "strace",
    "Procesy",
    "Alex"
  ],
  [
    "py-spy",
    "benfred/py-spy",
    "py-spy",
    "Procesy",
    "Alex"
  ],
  [
    "async-profiler",
    "async-profiler/async-profiler",
    "asprof",
    "Procesy",
    "Alex"
  ],
  [
    "Memray",
    "bloomberg/memray",
    "memray",
    "Procesy",
    "Alex"
  ],
  [
    "rr",
    "rr-debugger/rr",
    "rr",
    "Procesy",
    "Alex"
  ],
  [
    "Smartmontools",
    "smartmontools/smartmontools",
    "smartctl",
    "Sprzęt",
    "Alex"
  ],
  [
    "NVMe CLI",
    "linux-nvme/nvme-cli",
    "nvme",
    "Sprzęt",
    "Alex"
  ],
  [
    "FIO",
    "axboe/fio",
    "fio",
    "Sprzęt",
    "Alex"
  ],
  [
    "Memtest86+",
    "memtest86plus/memtest86plus",
    "",
    "Sprzęt",
    "Alex"
  ],
  [
    "lm-sensors",
    "lm-sensors/lm-sensors",
    "sensors",
    "Sprzęt",
    "Aria"
  ],
  [
    "MTR",
    "traviscross/mtr",
    "mtr",
    "Sieć",
    "Aurelius"
  ],
  [
    "iperf3",
    "esnet/iperf",
    "iperf3",
    "Sieć",
    "Aurelius"
  ],
  [
    "tcpdump",
    "the-tcpdump-group/tcpdump",
    "tcpdump",
    "Sieć",
    "Aurelius"
  ],
  [
    "Nmap",
    "nmap/nmap",
    "nmap",
    "Sieć",
    "Aurelius"
  ],
  [
    "DNSDiag",
    "farrokhi/dnsdiag",
    "dnsping",
    "Sieć",
    "Aurelius"
  ],
  [
    "Blackbox Exporter",
    "prometheus/blackbox_exporter",
    "blackbox_exporter",
    "API",
    "Aurelius"
  ],
  [
    "testssl.sh",
    "testssl/testssl.sh",
    "testssl.sh",
    "API",
    "Astyria"
  ],
  [
    "k6",
    "grafana/k6",
    "k6",
    "API",
    "Aurelius"
  ],
  [
    "GoAccess",
    "allinurl/goaccess",
    "goaccess",
    "API",
    "Aria"
  ],
  [
    "HTTPie",
    "httpie/cli",
    "http",
    "API",
    "Aurelius"
  ],
  [
    "Lynis",
    "CISOfy/lynis",
    "lynis",
    "Bezpieczeństwo",
    "Astyria"
  ],
  [
    "ssh-audit",
    "jtesta/ssh-audit",
    "ssh-audit",
    "Bezpieczeństwo",
    "Astyria"
  ],
  [
    "Trivy",
    "aquasecurity/trivy",
    "trivy",
    "Bezpieczeństwo",
    "Astyria"
  ],
  [
    "Falco",
    "falcosecurity/falco",
    "falco",
    "Bezpieczeństwo",
    "Astyria"
  ],
  [
    "Wazuh",
    "wazuh/wazuh",
    "",
    "Bezpieczeństwo",
    "Astyria"
  ],
  [
    "AIDE",
    "aide/aide",
    "aide",
    "Integralność",
    "Astyria"
  ],
  [
    "OpenSCAP",
    "OpenSCAP/openscap",
    "oscap",
    "Integralność",
    "Astyria"
  ],
  [
    "Gitleaks",
    "gitleaks/gitleaks",
    "gitleaks",
    "Integralność",
    "Astyria"
  ],
  [
    "Checkov",
    "bridgecrewio/checkov",
    "checkov",
    "Integralność",
    "Astyria"
  ],
  [
    "ClamAV",
    "Cisco-Talos/clamav",
    "clamscan",
    "Integralność",
    "Astyria"
  ],
  [
    "ctop",
    "bcicen/ctop",
    "ctop",
    "Kontenery",
    "Alex"
  ],
  [
    "Docker Bench",
    "docker/docker-bench-security",
    "docker-bench-security.sh",
    "Kontenery",
    "Astyria"
  ],
  [
    "Kubescape",
    "kubescape/kubescape",
    "kubescape",
    "Kontenery",
    "Astyria"
  ],
  [
    "Popeye",
    "derailed/popeye",
    "popeye",
    "Kontenery",
    "Alex"
  ],
  [
    "Hubble",
    "cilium/hubble",
    "hubble",
    "Kontenery",
    "Aurelius"
  ],
  [
    "pg_activity",
    "dalibo/pg_activity",
    "pg_activity",
    "Bazy danych",
    "Alex"
  ],
  [
    "pgBadger",
    "darold/pgbadger",
    "pgbadger",
    "Bazy danych",
    "Alex"
  ],
  [
    "MySQLTuner",
    "major/MySQLTuner-perl",
    "mysqltuner",
    "Bazy danych",
    "Alex"
  ],
  [
    "RedisInsight",
    "redis/RedisInsight",
    "",
    "Bazy danych",
    "Alex"
  ],
  [
    "kafkactl",
    "deviceinsight/kafkactl",
    "kafkactl",
    "Bazy danych",
    "Aurelius"
  ],
  [
    "lnav",
    "tstack/lnav",
    "lnav",
    "Obserwowalność",
    "Aria"
  ],
  [
    "Jaeger",
    "jaegertracing/jaeger",
    "",
    "Obserwowalność",
    "Aurelius"
  ],
  [
    "Sentry",
    "getsentry/sentry",
    "",
    "Obserwowalność",
    "Alex"
  ],
  [
    "Prometheus",
    "prometheus/prometheus",
    "prometheus",
    "Obserwowalność",
    "Aria"
  ],
  [
    "Grafana",
    "grafana/grafana",
    "grafana-server",
    "Obserwowalność",
    "Aria"
  ]
];
export const DIAGNOSTIC_TOOLS = Object.freeze(ENTRIES.map(([name, repository, binary, category, agent], index) => Object.freeze({
  id: index + 1, name, repository, github: 'https://github.com/' + repository,
  binary: binary || null, category, agent,
})));

export function findExecutable(name, searchPath = process.env.PATH || '') {
  if (!name || !/^[a-zA-Z0-9._+-]+$/.test(name)) return false;
  for (const dir of String(searchPath).split(path.delimiter)) {
    if (!dir || !path.isAbsolute(dir)) continue;
    try {
      const target = path.join(dir, name);
      if (fs.statSync(target).isFile()) {
        fs.accessSync(target, fs.constants.X_OK);
        return true;
      }
    } catch { /* absent or inaccessible; never run the tool */ }
  }
  return false;
}

export function diagnosticInventory(searchPath = process.env.PATH || '') {
  const tools = DIAGNOSTIC_TOOLS.map(tool => {
    const available = tool.binary ? findExecutable(tool.binary, searchPath) : null;
    return { ...tool, available, detection: available === null ? 'manual-or-service' : available ? 'path-detected' : 'not-found-in-path' };
  });
  return {
    total: tools.length, pathDetected: tools.filter(item => item.available === true).length,
    manuallyChecked: tools.filter(item => item.available === null).length,
    source: 'server-PATH-only', scannedAt: new Date().toISOString(), tools,
    note: 'Wykrycie pliku wykonywalnego nie oznacza działającej usługi ani udanego testu. Narzędzia nie są uruchamiane ani instalowane.',
  };
}

function availableMemoryBytes() {
  if (process.platform === 'linux') {
    try {
      const match = fs.readFileSync('/proc/meminfo', 'utf8').match(/^MemAvailable:\s+(\d+) kB/m);
      if (match) return Number(match[1]) * 1024;
    } catch { /* fall back to OS readings */ }
  }
  return os.freemem();
}

export function diagnosticSnapshot() {
  const totalMemoryBytes = os.totalmem();
  const available = availableMemoryBytes();
  const cpus = Math.max(1, os.availableParallelism?.() || os.cpus()?.length || 1);
  let diskFreePercent = null;
  try {
    const stat = fs.statfsSync(process.cwd());
    if (stat.blocks > 0) diskFreePercent = Number((100 * Number(stat.bavail) / Number(stat.blocks)).toFixed(1));
  } catch { /* unsupported filesystem */ }
  let storeWeakPermissions = null;
  const storePath = path.resolve(process.env.BASTILLA_LIVE_CHAT_STORE_PATH || 'data/live-chat-state.json');
  try {
    if (process.platform !== 'win32') storeWeakPermissions = Boolean(fs.statSync(storePath).mode & 0o077);
  } catch { /* absent state file does not prove misconfiguration */ }
  return {
    sampledAt: new Date().toISOString(), hostScope: 'current-process-or-container',
    cpuCount: cpus, load1m: Number(os.loadavg()[0].toFixed(2)),
    totalMemoryBytes, availableMemoryBytes: available,
    availableMemoryPercent: totalMemoryBytes ? Number((100 * available / totalMemoryBytes).toFixed(1)) : null,
    diskFreePercent, uptimeSeconds: Math.round(os.uptime()),
    storeWeakPermissions,
    workerRunsAsRoot: typeof process.getuid === 'function' ? process.getuid() === 0 : null,
    note: 'Odczyt systemu widzianego przez proces; dla kontenera nie oznacza pełnego hosta.',
  };
}

const ROLE_ALERTS = Object.freeze({
  Aria: s => [
    ...(s.availableMemoryPercent !== null && s.availableMemoryPercent < 10 ? ['MemAvailable poniżej 10% RAM'] : []),
    ...(s.load1m > s.cpuCount * 2 ? ['Średnie obciążenie 1 min przekracza 2× liczbę CPU'] : []),
  ],
  Alex: s => s.diskFreePercent !== null && s.diskFreePercent < 10 ? ['Wolne miejsce na dysku poniżej 10%'] : [],
  Astyria: s => [
    ...(s.storeWeakPermissions === true ? ['Plik stanu czatu dostępny dla grupy/innych użytkowników'] : []),
    ...(s.workerRunsAsRoot === true ? ['Worker agenta działa jako root; zalecane konto nieuprzywilejowane'] : []),
  ],
  Aurelius: s => [], // Network checks require a separately configured, trusted target.
});

export function createBackgroundAgentDiagnostics({
  agent, enabled = process.env.BASTILLA_DIAGNOSTICS_AUTOMONITOR !== 'off',
  intervalMs = 300000, now = () => Date.now(), snapshotProvider = diagnosticSnapshot,
} = {}) {
  if (!ROLE_ALERTS[agent]) throw new Error('Unknown diagnostic agent');
  let lastChecked = -Infinity;
  let lastAlertKey = '';
  return async function onBackgroundIdle(context = {}) {
    if (!enabled || typeof context.sendMessage !== 'function') return false;
    const moment = now();
    if (moment - lastChecked < Math.max(60000, intervalMs)) return false;
    lastChecked = moment;
    const snapshot = snapshotProvider();
    const alerts = ROLE_ALERTS[agent](snapshot);
    const key = alerts.join('|');
    if (!alerts.length) { lastAlertKey = ''; return false; }
    if (key === lastAlertKey) return false;
    lastAlertKey = key;
    await context.sendMessage(
      '[AUTOMATYCZNY ALERT DIAGNOSTYCZNY / ' + agent + ']\n' +
      alerts.map(item => '- ' + item).join('\n') +
      '\nOdczyt: ' + snapshot.sampledAt +
      '\nZakres: ' + snapshot.hostScope +
      '\nWymagana weryfikacja przed naprawą. Żadne polecenie naprawcze nie zostało wykonane.',
      { channel: 'Wszyscy', signal: context.signal },
    );
    return true;
  };
}
