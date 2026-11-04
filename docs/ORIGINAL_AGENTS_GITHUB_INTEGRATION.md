# Original AI Studio agents ↔ Bastilla_1_2 ↔ GitHub

This integration is for the **original** Aria, Alex, Astyria and Aurelius runtimes. GitHub Copilot agent profiles are NOT substitutes.

## Existing transport
The branch includes `integrations/live-chat/worker-runner.mjs`, `http-agent-adapter.mjs`, an authenticated queue, event stream, and systemd workers. The transport is not proof that any original model is connected.

## Configure each real agent (deployment only)
For each agent create a separate private `/etc/bastilla/live-chat/<Agent>.env` with:
```
BASTILLA_LIVE_CHAT_AGENT=Aria
BASTILLA_LIVE_CHAT_BASE_URL=https://YOUR-DEPLOYED-BASTILLA-HOST
BASTILLA_LIVE_CHAT_WORKER_TOKEN=YOUR_UNIQUE_WORKER_SECRET
BASTILLA_AGENT_ADAPTER=/opt/bastilla/integrations/live-chat/http-agent-adapter.mjs
BASTILLA_AGENT_ENDPOINT=https://YOUR-AUTHENTICATED-ORIGINAL-AGENT-ENDPOINT
BASTILLA_AGENT_API_KEY=YOUR_ORIGINAL_AGENT_API_KEY
```
Change the agent name and credentials for the other three agents. The endpoint must be backed by that original agent's real runtime; an AI Studio preview URL is not automatically an authenticated inference endpoint. Do not commit credentials. Configure server-side `BASTILLA_LIVE_CHAT_WORKER_TOKENS` with matching distinct secrets, session settings, allowed origin and persistent storage as in `docs/LIVE_CHAT_SETUP.md`.

## GitHub integration and permissions
A GitHub **App** installed on `u6930438163-code/Bastilla_1_2` is preferred. Give it narrowly scoped permissions for Contents, Issues, Pull requests, Actions and Checks as needed, and keep its installation token server-side. The original runtime should receive tool calls via a trusted backend, with audit logs and approvals for destructive operations. Do not expose a GitHub admin token to the frontend, an LLM prompt, or chat history.

**Repository administrator** is a separate GitHub permission granted to an actual GitHub user/app by the owner; a YAML `permissions: FULL_ADMINISTRATIVE_ACCESS` field does not grant it. GitHub App installation permissions and repository-admin access are not interchangeable. Full admin rights for four autonomous runtimes are not established by this PR. Owner must approve and provision any additional privileged access separately, after verifying agent identities and testing the constrained integration.

## Validation gates
1. Verify the original runtime identity and HTTPS endpoint of each agent independently.
2. Deploy and start four separate workers; verify `systemctl status bastilla-live-chat-worker@Aria` (and Alex/Astyria/Aurelius), then check logs with `journalctl -u bastilla-live-chat-worker@Aria -n 100 --no-pager`.
3. Verify authenticated heartbeat in `GET /api/live-chat/status` using an operator session; a heartbeat proves worker connectivity only, not AI inference.
4. Send one unique challenge to each agent and verify a fresh, non-static answer; then test agent-to-agent and unsolicited messages.
5. Verify the GitHub App identity with a read-only repo call; create a test issue/branch with explicit approval and inspect audit trail. Never grant repository admin solely based on a profile name.
6. Run `npm ci && npm run verify`, review CI, and merge only after verification.

## Known blockers
Without a real original-agent endpoint/adapter, deployed secrets, a persistent running host, and an installed authorized GitHub integration, this is an **unconnected integration scaffold**. Do not report agents as online or working merely because files, branches, or GitHub Actions exist.
