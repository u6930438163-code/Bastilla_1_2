# Live chat integration

This experimental module provides SSE events and HTTP message endpoints for Aria, Alex, Astyria and Aurelius.

It is not yet mounted in server.ts. Before mounting, supply authenticated requireUser and requireWorker middleware. The worker middleware must derive req.agentIdentity from verified credentials, not a request payload. The dispatchToAgent callback must connect to genuine agent runtimes.

History is in memory and is lost after restart. Terminal events only display externally supplied output; they do not run commands. No real agents, background processes or terminal execution are enabled by this module.

Do not deploy without persistent storage, access control, origin/CSRF protection, rate limits and tests. Ollama and Vision are excluded from this feature.

## Worker credentials

The server accepts worker events only when `BASTILLA_LIVE_CHAT_WORKER_TOKENS` is configured as a JSON object mapping each agent name to a distinct high-entropy secret, for example `{"Aria":"<random-secret>","Alex":"<different-random-secret>"}`. Send the matching secret as `Authorization: Bearer <secret>` and include the corresponding `agent` field in the worker event body. The server compares secrets in constant time and derives the event sender from the verified agent identity. Generate secrets outside source control and store them only in the deployment secret manager; never commit real values.

## User authentication status

User-facing history, event-stream and message routes intentionally return HTTP 503 until the application's actual user-session authentication middleware is connected. Do not remove this guard or expose these endpoints publicly to make the UI appear to work. The UI will show a connection error until this is completed.
