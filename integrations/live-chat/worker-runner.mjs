import 'dotenv/config';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAgentWorker } from './worker-client.mjs';
import { createBackgroundAgentDiagnostics } from '../diagnostics/catalog.mjs';
import { resolveAgentWorkerPolicy } from './asymmetric-policy.mjs';

const agent = process.env.BASTILLA_LIVE_CHAT_AGENT || '';
const adapterPath = process.env.BASTILLA_AGENT_ADAPTER || '';
if (!adapterPath) throw new Error('Set BASTILLA_AGENT_ADAPTER to the original agent runtime adapter module');

const adapter = await import(pathToFileURL(resolve(adapterPath)).href);
if (typeof adapter.runAgent !== 'function') {
  throw new Error('The original agent adapter must export async function runAgent(job, context)');
}

const diagnosticOnIdle = createBackgroundAgentDiagnostics({ agent });
const policy = resolveAgentWorkerPolicy(agent);

const worker = createAgentWorker({
  baseUrl: process.env.BASTILLA_LIVE_CHAT_BASE_URL || '',
  agent,
  token: process.env.BASTILLA_LIVE_CHAT_WORKER_TOKEN || '',
  runAgent: adapter.runAgent,
  maxConcurrency: policy.concurrency,
  shutdownTimeoutMs: Number(process.env.BASTILLA_AGENT_SHUTDOWN_TIMEOUT_MS || 15000),
  pollIntervalMs: policy.pollIntervalMs,
  idleCallbackIntervalMs: policy.idleCallbackIntervalMs,
  policyMode: policy.mode,
  onIdle: async (context) => {
    // Read-only agent diagnostics are distinct from original agent's autonomous LLM actions.
    await diagnosticOnIdle(context);
    if (typeof adapter.onIdle === 'function') await adapter.onIdle(context);
  },
  onError: (error) => console.error('[LIVE CHAT WORKER]', agent, error?.message || error),
});

process.once('SIGINT', () => worker.stop());
process.once('SIGTERM', () => worker.stop());
console.log('[LIVE CHAT WORKER] Starting authenticated worker for ' + agent + ' (mode ' + policy.mode + ', role ' + policy.role + ', concurrency ' + worker.maxConcurrency + ')');
await worker.start();
