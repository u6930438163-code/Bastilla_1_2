import 'dotenv/config';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAgentWorker } from './worker-client.mjs';

const agent = process.env.BASTILLA_LIVE_CHAT_AGENT || '';
const adapterPath = process.env.BASTILLA_AGENT_ADAPTER || '';
if (!adapterPath) throw new Error('Set BASTILLA_AGENT_ADAPTER to the original agent runtime adapter module');

const adapter = await import(pathToFileURL(resolve(adapterPath)).href);
if (typeof adapter.runAgent !== 'function') {
  throw new Error('The original agent adapter must export async function runAgent(job, context)');
}

const worker = createAgentWorker({
  baseUrl: process.env.BASTILLA_LIVE_CHAT_BASE_URL || '',
  agent,
  token: process.env.BASTILLA_LIVE_CHAT_WORKER_TOKEN || '',
  runAgent: adapter.runAgent,
  onError: (error) => console.error('[LIVE CHAT WORKER]', agent, error?.message || error),
});

process.once('SIGINT', () => worker.stop());
process.once('SIGTERM', () => worker.stop());
console.log('[LIVE CHAT WORKER] Starting authenticated worker for ' + agent);
await worker.start();
