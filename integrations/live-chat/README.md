# Live chat integration

This experimental module provides SSE events and HTTP message endpoints for Aria, Alex, Astyria and Aurelius.

It is not yet mounted in server.ts. Before mounting, supply authenticated requireUser and requireWorker middleware. The worker middleware must derive req.agentIdentity from verified credentials, not a request payload. The dispatchToAgent callback must connect to genuine agent runtimes.

History is in memory and is lost after restart. Terminal events only display externally supplied output; they do not run commands. No real agents, background processes or terminal execution are enabled by this module.

Do not deploy without persistent storage, access control, origin/CSRF protection, rate limits and tests. Ollama and Vision are excluded from this feature.
