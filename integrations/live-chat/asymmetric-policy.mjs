// Runtime-only scheduling policy for four ORIGINAL agents. No substitute models.
// Modes differ in concurrency and cadence, but never in authentication or system permissions.
export const AGENT_WORKER_PROFILES = Object.freeze({
  Aria: Object.freeze({ role: 'monitoring', concurrency: 2, pollIntervalMs: 2500, idleCallbackIntervalMs: 30000 }),
  Alex: Object.freeze({ role: 'diagnostics', concurrency: 3, pollIntervalMs: 1000, idleCallbackIntervalMs: 45000 }),
  Astyria: Object.freeze({ role: 'security', concurrency: 1, pollIntervalMs: 3500, idleCallbackIntervalMs: 60000 }),
  Aurelius: Object.freeze({ role: 'network', concurrency: 2, pollIntervalMs: 2000, idleCallbackIntervalMs: 40000 }),
});
const UNIFORM = Object.freeze({ concurrency: 2, pollIntervalMs: 2500, idleCallbackIntervalMs: 30000 });

function boundedInteger(raw, label, fallback, minimum, maximum) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < minimum || n > maximum) {
    throw new Error(label + ' must be a whole number between ' + minimum + ' and ' + maximum);
  }
  return n;
}

export function resolveAgentWorkerPolicy(agent, env = process.env) {
  const profile = AGENT_WORKER_PROFILES[agent];
  if (!profile) throw new Error('Unknown original agent identity: ' + String(agent));
  const requestedMode = String(env.BASTILLA_WORKER_MODE || 'asymmetric').trim().toLowerCase();
  if (!['asymmetric', 'uniform'].includes(requestedMode)) {
    throw new Error('BASTILLA_WORKER_MODE must be asymmetric or uniform');
  }
  const defaults = requestedMode === 'uniform' ? UNIFORM : profile;
  const configuredOverrides = ['BASTILLA_AGENT_CONCURRENCY','BASTILLA_AGENT_POLL_INTERVAL_MS','BASTILLA_AGENT_IDLE_INTERVAL_MS']
    .some(name => env[name] !== undefined && String(env[name]).trim() !== '');
  return Object.freeze({
    agent, role: profile.role,
    mode: configuredOverrides ? 'custom' : requestedMode,
    concurrency: boundedInteger(env.BASTILLA_AGENT_CONCURRENCY, 'BASTILLA_AGENT_CONCURRENCY', defaults.concurrency, 1, 4),
    pollIntervalMs: boundedInteger(env.BASTILLA_AGENT_POLL_INTERVAL_MS, 'BASTILLA_AGENT_POLL_INTERVAL_MS', defaults.pollIntervalMs, 500, 60000),
    idleCallbackIntervalMs: boundedInteger(env.BASTILLA_AGENT_IDLE_INTERVAL_MS, 'BASTILLA_AGENT_IDLE_INTERVAL_MS', defaults.idleCallbackIntervalMs, 5000, 300000),
  });
}
