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
   - BASTILLA_LIBRECHAT_OWNER_EMAIL: exact email address of the single LibreChat account authorized to reach original Bastilla workers. This value stays only in the private .env.local file. LibreChat passes its authenticated user email via the internal custom endpoint header; an absent or different address is rejected with HTTP 403.
3. Run 'bash scripts/setup-librechat.sh config' to validate Docker configuration. WARNING: expanded Compose output can contain secrets; do not share it.
4. Run 'bash scripts/setup-librechat.sh up -d --build'. The script clones the official LibreChat repository to the gitignored .bastilla-tools/librechat directory, preserves its .env, and uses the additive override from integrations/librechat.
5. Run 'bash scripts/setup-librechat.sh ps'. In a private local deployment visit http://localhost:3080 and register the administrator account **using the same email set in BASTILLA_LIBRECHAT_OWNER_EMAIL**. After registration, disable further signup (ALLOW_REGISTRATION=false and ALLOW_SOCIAL_REGISTRATION=false in the private upstream .env), restart the API service and configure HTTPS before any public exposure. Requests from another LibreChat account are rejected by the bridge. This bridge is designed for a trusted SINGLE-USER deployment.
6. Choose the "Bastilla Agents" endpoint in LibreChat, select Aria/Alex/Astyria/Aurelius and send a short message. Check the original reply in Bastilla LIVE and inspect real worker heartbeats.
7. Optionally set VITE_LIBRECHAT_URL to the HTTPS LibreChat address in Bastilla deployment variables and rebuild Bastilla. The "LibreChat · Bastilla" navigation module will link to it and report LIVE worker heartbeat status. On a phone, localhost refers to the phone itself, not the hosting server.

The upstream LibreChat .env supports additional providers such as OpenAI, each requiring separate API keys; a ChatGPT subscription does not include OpenAI API credits.

Account matching is a **defense-in-depth** condition, not a replacement for proper LibreChat authentication or private network isolation. Keep BASTILLA_BRIDGE_API_KEY server-side; do not expose it to the web frontend. Use the same LibreChat login email across restarts.


## Long-term memory (LibreChat and original Bastilla agents)

- Native LibreChat User Memory is enabled in integrations/librechat/librechat.yaml. It is stored on the deployed LibreChat server, in its persistent database; it is NEVER committed to this GitHub repository.
- Automatic extraction is explicitly disabled (`agent.enabled: false`) because it needs a separate model/API and would incur separate costs. This does not prevent manually saved memories from being referenced on later chats when the user has enabled memory.
- The Memories panel in LibreChat lets the owner manually create, correct, disable and delete entries. The enabled keys are user_preferences, conversation_context, project_context and learned_facts. Overall storage cap: 8,000 tokens; per-entry cap: 10,000 characters. These values are guardrails, not a claim of unlimited context.
- No automatic memory-extraction agent is enabled. This avoids extra model calls/charges and avoids asking the original workers for tool calling they do not support. Memory entries must be added through LibreChat's Memories UI.
- The existing bridge now forwards a bounded portion of system context (including native LibreChat memory when injected into the request) together with the last few conversation turns to the **same original worker**. The Bastilla LIVE messages endpoint permits max 8,000 characters, so at most around 4,300 characters of system/memory context and a smaller amount of recent dialogue can fit. This is **not** whole-history semantic search; large memories must be edited/summarized to stay useful.
- The bridge forwards memory context only when LibreChat includes it in the completion request, respecting LibreChat's per-user memory toggle. Its own conversation database and worker chat history are distinct; neither is synchronized with OpenAI ChatGPT memory.
- **Privacy/retention warning:** the bridge merges remembered context into the text of the outgoing Bastilla LIVE user message. That text is saved as part of Bastilla's persistent chat history, in addition to LibreChat's own storage. Deleting an entry from LibreChat Memories does **not** retroactively delete copies sent to Bastilla LIVE. Avoid sensitive memories (passwords, tokens, private medical/financial data). If necessary, delete stored history and backups from Bastilla separately, using supported administrator procedures. The bridge does not auto-delete archives or another application's data.
- Keep LibreChat's database volumes persistent and backed up securely on your deployment. Do not store account exports in a public GitHub repository.

### Bring selected ChatGPT subscription memories manually (opt-in)

There is **no supported automatic API connection** between your ChatGPT account memory and this open-source LibreChat deployment. ChatGPT subscription access is also separate from separately billed OpenAI API requests. Do NOT provide a ChatGPT password, authentication cookie or session token to Bastilla or the bridge.

1. In ChatGPT, review the personal Memory summary under Settings > Personalization > Memory summary > Manage (if available). Select only project context and preferences that you are comfortable sharing with your self-hosted system.
2. Log into your **private** LibreChat instance. Open Memories in the side panel and select Create Memory.
3. Manually create keys such as project_context, conversation_context or user_preferences, with accurate, concise text. Never paste passwords, API keys, private identity documents or full chat exports.
4. Start a new LibreChat conversation using endpoint Bastilla Agents and select an existing worker. Ask a concrete question about a saved fact. Verify that the response corresponds to the real worker in Bastilla LIVE.
5. Correct or delete mistaken memories in the Memories panel. Use the per-chat Use memory setting to stop sending stored memories to that conversation.

A personal memory entry is a durable fact, not an entire chat history. Large documents or retrospective search over months of conversations require a separately managed, access-controlled document/vector retrieval system and are **not** provided by this change.

## Operational notes

Use 'bash scripts/setup-librechat.sh logs --tail=60 bastilla-agent-bridge' to inspect adapter failures, and 'bash scripts/setup-librechat.sh logs --tail=60 api' for LibreChat logs. 'bash scripts/setup-librechat.sh down' stops only the LibreChat stack. The upstream files are NOT embedded or copied into Bastilla Git.

Security: The gateway listens only inside the Compose network (no published host port). It authenticates LibreChat with a 32+ byte secret, then uses the same Bastilla operator session as a trusted service account. Do not deploy this in an untrusted multi-user LibreChat instance or expose the unaudited Bastilla API publicly. Secrets must stay in the untracked .env.local and host environment, not in GitHub. The worker status view itself requires a logged-in Bastilla session.

## Verification limits

A mock API contract test can confirm request/response handling, but NOT actual worker connectivity. A live installation must independently verify Docker startup, HTTPS/authentication, worker heartbeats, streaming-envelope compatibility with LibreChat, real reply text, mobile access and security controls. The CI unit test checks SSE formatting against a mock HTTP server, NOT real runtime tokens or model responses. Merely committing files to GitHub does not launch services.

Official references: https://github.com/LibreChat-AI/LibreChat ; https://www.librechat.ai/docs/local/docker ; https://www.librechat.ai/docs/configuration/librechat_yaml
