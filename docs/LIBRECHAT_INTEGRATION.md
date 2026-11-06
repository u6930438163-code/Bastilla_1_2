# LibreChat + Bastilla_1_2

Target: u6930438163-code/Bastilla_1_2. The integration is additive: no existing chat, agent, MCP or Bastilla API is replaced.

## Architecture

Official LibreChat (a separate Docker stack) -> internal OpenAI-compatible adapter -> authenticated Bastilla LIVE API -> the REAL original Aria, Alex, Astyria and Aurelius workers.

The LibreChat endpoint is named "Bastilla Agents", with four model names. The names select existing queues; they do not create replacement AI models. If the original worker has no fresh authenticated heartbeat, the adapter returns HTTP 503. It waits up to 90 seconds for a real worker response, then returns a timeout. A queued job can still finish in Bastilla later. Only the most recent plain-text user message is forwarded; the bridge supports OpenAI-compatible SSE responses (one complete text chunk after the original worker finishes), not token-by-token worker streaming. File attachments, tool calls and function execution are NOT supported. LibreChat's own history is separate from Bastilla's original chat history. The existing worker transport still supports agent-to-agent messages.

## Requirements

- Git, Docker, Docker Compose v2, Node.js 24 for Bastilla, and sufficient resources for LibreChat's database, search and RAG services.
- Running Bastilla API, accessible to containers, and configured LIVE chat with persistent storage and credentials. See docs/LIVE_CHAT_SETUP.md.
- Four genuine agent runtime adapters. GitHub agent profiles are not runnable worker processes.

## Installation

1. Configure and run Bastilla LIVE chat first, then confirm a REAL reply from at least one original worker. Keep the Bastilla API port 3000 private until a complete authentication audit.
2. Copy integrations/librechat/.env.local.example to integrations/librechat/.env.local (ignored by Git). Set:
   - BASTILLA_API_BASE_URL: Bastilla URL reachable from Docker (Linux default http://host.docker.internal:3000).
   - BASTILLA_LIVE_CHAT_ALLOWED_ORIGIN: the exact browser origin configured on the Bastilla server; NOT the LibreChat origin.
   - BASTILLA_LIVE_CHAT_USER_PASSWORD: same Bastilla operator password, minimum 16 characters.
   - BASTILLA_BRIDGE_API_KEY: unique randomly generated secret, minimum 32 bytes. Generate with 'openssl rand -hex 32'.
3. Run 'bash scripts/setup-librechat.sh config' to validate Docker configuration. WARNING: expanded Compose output can contain secrets; do not share it.
4. Run 'bash scripts/setup-librechat.sh up -d --build'. The script clones the official LibreChat repository to the gitignored .bastilla-tools/librechat directory, preserves its .env, and uses the additive override from integrations/librechat.
5. Run 'bash scripts/setup-librechat.sh ps'. In a private local deployment visit http://localhost:3080 and register the administrator account. Protect remote LibreChat with authentication, restricted registration and HTTPS BEFORE exposing it to the internet. This bridge is designed for a trusted SINGLE-USER deployment.
6. Choose the "Bastilla Agents" endpoint in LibreChat, select Aria/Alex/Astyria/Aurelius and send a short message. Check the original reply in Bastilla LIVE and inspect real worker heartbeats.
7. Optionally set VITE_LIBRECHAT_URL to the HTTPS LibreChat address in Bastilla deployment variables and rebuild Bastilla. The "LibreChat · Bastilla" navigation module will link to it and report LIVE worker heartbeat status. On a phone, localhost refers to the phone itself, not the hosting server.

The upstream LibreChat .env supports additional providers such as OpenAI, each requiring separate API keys; a ChatGPT subscription does not include OpenAI API credits.

## Operational notes

Use 'bash scripts/setup-librechat.sh logs --tail=60 bastilla-agent-bridge' to inspect adapter failures, and 'bash scripts/setup-librechat.sh logs --tail=60 api' for LibreChat logs. 'bash scripts/setup-librechat.sh down' stops only the LibreChat stack. The upstream files are NOT embedded or copied into Bastilla Git.

Security: The gateway listens only inside the Compose network (no published host port). It authenticates LibreChat with a 32+ byte secret, then uses the same Bastilla operator session as a trusted service account. Do not deploy this in an untrusted multi-user LibreChat instance or expose the unaudited Bastilla API publicly. Secrets must stay in the untracked .env.local and host environment, not in GitHub. The worker status view itself requires a logged-in Bastilla session.

## Verification limits

A mock API contract test can confirm request/response handling, but NOT actual worker connectivity. A live installation must independently verify Docker startup, HTTPS/authentication, worker heartbeats, streaming-envelope compatibility with LibreChat, real reply text, mobile access and security controls. The CI unit test checks SSE formatting against a mock HTTP server, NOT real runtime tokens or model responses. Merely committing files to GitHub does not launch services.

Official references: https://github.com/LibreChat-AI/LibreChat ; https://www.librechat.ai/docs/local/docker ; https://www.librechat.ai/docs/configuration/librechat_yaml
