#!/usr/bin/env node
// Read-only deployment preflight. Does not contact providers or print secrets.
const agents = ['Aria', 'Alex', 'Astyria', 'Aurelius'];
const errors = [];
const env = process.env;
const required = ['BASTILLA_LIVE_CHAT_BASE_URL', 'BASTILLA_AGENT_ADAPTER', 'BASTILLA_AGENT_ENDPOINT', 'BASTILLA_AGENT_API_KEY', 'BASTILLA_LIVE_CHAT_WORKER_TOKEN'];
for (const key of required) if (!env[key]) errors.push('Missing ' + key);
if (!agents.includes(env.BASTILLA_LIVE_CHAT_AGENT)) errors.push('BASTILLA_LIVE_CHAT_AGENT must name one original agent');
for (const key of ['BASTILLA_AGENT_API_KEY', 'BASTILLA_LIVE_CHAT_WORKER_TOKEN']) {
  if (env[key] && env[key].length < 32) errors.push(key + ' must be at least 32 characters');
}
for (const key of ['BASTILLA_LIVE_CHAT_BASE_URL', 'BASTILLA_AGENT_ENDPOINT']) {
  if (!env[key]) continue;
  try {
    const url = new URL(env[key]);
    const localhost = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !localhost) errors.push(key + ' must use HTTPS except on localhost');
    if (url.username || url.password) errors.push(key + ' must not contain URL credentials');
  } catch { errors.push(key + ' must be a valid URL'); }
}
if (errors.length) {
  for (const error of errors) console.error('FAIL:', error);
  process.exitCode = 1;
} else {
  console.log('Configuration shape valid for ' + env.BASTILLA_LIVE_CHAT_AGENT);
  console.log('NOT VERIFIED: original AI identity, live heartbeat, model response, or GitHub permissions.');
}
