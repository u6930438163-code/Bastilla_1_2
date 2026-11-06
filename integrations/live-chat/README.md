# Bastilla live multi-agent chat

This module provides authenticated user sessions, a persistent message/event store, a durable worker queue, server-sent events and a worker client. It does not create substitute agents or call a model on their behalf.

## Server configuration

Configure these values in the deployment secret manager, not in Git:

- BASTILLA_LIVE_CHAT_ALLOWED_ORIGIN: exact public origin, including scheme and port when nonstandard; no path.
- BASTILLA_LIVE_CHAT_USER_PASSWORD: legacy operator password, at least 16 characters. If set, disables first-run enrollment.
- BASTILLA_LIVE_CHAT_SETUP_TOKEN: one-time server-side enrollment token (32+ random bytes), remove after enrollment.
- BASTILLA_LIVE_CHAT_CREDENTIALS_PATH: persistent credentials file, default data/live-chat-credentials.json (salted scrypt password hash, mode 0600).
- BASTILLA_LIVE_CHAT_SESSION_SECRET: random secret with at least 32 bytes.
- BASTILLA_LIVE_CHAT_COOKIE_SECURE: true for HTTPS; set false only for localhost development.
- BASTILLA_LIVE_CHAT_WORKER_TOKENS: JSON object containing four distinct random secrets, each at least 32 characters, keyed by Aria, Alex, Astyria and Aurelius.
- BASTILLA_LIVE_CHAT_STORE_PATH: persistent writable file path. The default is data/live-chat-state.json.

If the user session or worker credentials are missing, the relevant routes fail closed. The store uses atomic file replacement and serialized writes. Mount its directory on persistent storage; an ephemeral container filesystem is not a durable deployment.

## First-run owner setup

When no operator password or credentials file exists, set the allowed origin, session secret and setup token as **private deployment secrets**, then restart the Bastilla server. In the main chat, click **Połącz LIVE**, enter the token once and choose a unique 16+ character password. POST /api/live-chat/setup requires the exact Origin and setup token, is rate limited and cannot replace an existing password. GET /api/live-chat/setup exposes only a non-secret readiness state. On success the server issues a signed cookie. Save credentials on a durable private volume; remove the setup token from the environment and restart when done. When a legacy operator password is already configured, change it with the deployment secret manager, not the enrollment form. This never provisions original AI workers.

## Original agent workers

Each original agent runtime must supply an adapter module that exports:

    export async function runAgent(job, context) {
      // Forward the job to this original agent runtime and return its actual response.
      return { text: actualAgentReply };
    }

The adapter is deliberately not bundled. There is no built-in Gemini, Ollama, Copilot, static-response or mock fallback. A worker is not online until it sends a real authenticated heartbeat.

Set BASTILLA_LIVE_CHAT_AGENT, BASTILLA_AGENT_ADAPTER, BASTILLA_LIVE_CHAT_BASE_URL and BASTILLA_LIVE_CHAT_WORKER_TOKEN for each worker, then run integrations/live-chat/worker-runner.mjs. If an original agent exposes an authenticated HTTPS endpoint, integrations/live-chat/http-agent-adapter.mjs can call it using BASTILLA_AGENT_ENDPOINT and BASTILLA_AGENT_API_KEY. Its optional idle mode posts mode=idle and forwards any returned text as an unsolicited message. Otherwise provide a custom adapter for that original runtime. A systemd template and scripts/install-live-chat-workers.sh are included for hosts that run the four adapters as separate services.

The worker can send a reply to the operator or route a message to another agent with the optional to field set to an agent name or Wszyscy. The worker client also exposes sendMessage(text, options) for unsolicited agent-to-operator or agent-to-agent updates. An adapter may export onIdle(context); the runner invokes it periodically while no task is queued, so a persistent original runtime can proactively send status or work updates without waiting for a user prompt. The queue uses leases and retries, limits pending work and limits agent-to-agent hops and message rate to prevent runaway loops.

## Events, terminal and notifications

Messages and worker events are persisted before they are broadcast. EventSource clients replay missed events after reconnecting. The status endpoint reports only recent authenticated heartbeats; stale workers are offline.

Terminal events display output supplied by a worker. This module does not execute shell commands or provide a terminal process runner. A real terminal executor needs a separate isolated runner and explicit approval controls.

The web UI can show in-app alerts and browser notifications while the page is open. It does not yet provide Web Push when the browser is closed; do not describe it as an always-on push notification service.

## Scope boundary

The transport supports Aria, Alex, Astyria and Aurelius, direct user-to-agent messages, broadcasts, agent-to-agent routing, persisted history and background worker polling. The actual AI Studio runtime adapter or authenticated endpoint, deployment secrets and persistent host storage must be supplied and verified separately. Job leases are renewed while a worker is processing a long-running task. Ollama and Vision are not part of this feature.
