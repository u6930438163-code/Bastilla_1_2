# BastillaOS MCP bridge (local Ollama)

This optional bridge exposes a **read-only** subset of the existing BastillaOS API as MCP tools. It makes no OpenAI/Gemini API calls and does not alter the main application.

## Start

From the repository root in a Linux Codespace, run `npm run start:mcp` to start the local services and perform the MCP smoke test. The script checks whether Ollama is reachable but never launches it. An unavailable Ollama is reported separately and does not by itself mean the MCP transport is offline. Keep the terminal open while using the services.

The startup smoke test performs MCP `initialize`, `ping`, `tools/list`, and read-only diagnostic tool calls. A successful test confirms a local MCP handshake and a working local BastillaOS API path. It does **not** establish an authenticated connection from an external MCP client, including ChatGPT. The MCP listener binds to `127.0.0.1` only. If port 8000 is busy, choose another local port with `BASTILLA_MCP_PORT`; the startup script refuses to replace an existing listener.

Alternatively, start the bridge manually:

On the BastillaOS host, ensure BastillaOS and Ollama are already running.

```sh
python3 -m venv .venv-mcp
. .venv-mcp/bin/activate
pip install -r integrations/mcp/requirements.txt
python integrations/mcp/server.py
```

By default the MCP endpoint is `http://127.0.0.1:8000/mcp` and the BastillaOS API is `http://127.0.0.1:3000`. Override the latter with `BASTILLA_API_URL` if necessary. Set `BASTILLA_MCP_PORT` to choose another listener port; it remains bound to loopback.

## Available tools

- `ollama_status`: GET /api/ollama/models; reports provider reachability independently of MCP transport state
- `agents_status`: GET /api/agents/background/status
- `vm_status`: reads VM configuration/runtime status
- `agent_command`: optional limited diagnostics through POST /api/triad/command; disabled by default

No shell access, arbitrary commands, file writes, or model cloud API keys are required.

## Remote access

**Never publish port 8000 directly.** The underlying development API does not authenticate accounts. Use an HTTPS reverse proxy with proper authentication (ideally OAuth supported by your MCP client), access controls, and rate limits before registering a remote MCP URL. A tunnel alone does not provide authentication. Do not publish the BastillaOS development server itself.

## Notes

This bridge does not prove that ChatGPT can use a custom MCP server on your plan; availability depends on the client and account configuration. It also does not deploy anything from GitHub to your running Google AI Studio environment. Agent chat roles are not independent autonomous workers. Chat endpoints are intentionally excluded pending a reviewed authentication and permissions design.
