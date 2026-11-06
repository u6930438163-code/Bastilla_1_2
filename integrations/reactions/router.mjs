import { Router } from 'express';
import { chatReactionKeys, canonicalReactionActor } from '../../src/lib/chatReactionKeys.mjs';

export function createChatReactionsRouter({ store, getHistory, sameOrigin, requireWorker, notify }) {
  if (!store || typeof getHistory !== 'function' || typeof sameOrigin !== 'function' ||
      typeof requireWorker !== 'function' || typeof notify !== 'function') {
    throw new Error('Reactions need a persistent store, history verification and actor authentication.');
  }
  const router = Router();
  const messages = async () => {
    const history = await getHistory();
    const list = Array.isArray(history) ? history : [];
    return { history: list, keys: chatReactionKeys(list) };
  };
  const respondVote = async (req, res, actor) => {
    const key = req.body?.messageKey;
    const vote = req.body?.vote;
    if (typeof key !== 'string' || (vote !== 'up' && vote !== 'down' && vote !== null)) {
      return res.status(400).json({ error: 'Podaj messageKey oraz vote: up, down lub null.' });
    }
    try {
      const { keys } = await messages();
      if (!keys.includes(key)) return res.status(404).json({ error: 'Wiadomość nie istnieje w aktualnej historii czatu.' });
      const result = store.vote(key, actor, vote);
      notify();
      return res.json({ success: true, messageKey: key, ...result });
    } catch (error) {
      return res.status(error?.status || 503).json({ error: error?.message || 'Nie można zapisać głosu.' });
    }
  };
  router.get('/', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ reactions: store.list(), actors: ['Operator','Aria','Alex','Astyria','Aurelius'] });
  });
  router.delete('/', (req, res) => {
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Czyszczenie ocen wymaga żądania z tej aplikacji.' });
    try {
      store.clear();
      notify();
      return res.json({ success: true, reactions: {} });
    } catch (error) {
      return res.status(503).json({ error: error?.message || 'Nie udało się usunąć ocen.' });
    }
  });
  // Browser can only cast the operator vote. No caller-supplied actor.
  router.post('/vote', (req, res) => {
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Głos operatora wymaga żądania z tej aplikacji.' });
    return respondVote(req, res, 'Operator');
  });
  // Worker identity is verified by agent-specific bearer token.
  router.post('/worker/vote', requireWorker, (req, res) =>
    respondVote(req, res, canonicalReactionActor(req.agentIdentity)));
  router.get('/worker/messages', requireWorker, async (_req, res) => {
    try {
      const { history, keys } = await messages();
      const offset = Math.max(0, history.length - 80);
      return res.json({ messages: history.slice(offset).map((item, index) => ({
        messageKey: keys[index + offset],
        author: canonicalReactionActor(item.agent),
        preview: String(item.tekst || '').slice(0, 200),
        votes: store.get(keys[index + offset]),
      })) });
    } catch (error) {
      return res.status(503).json({ error: error?.message || 'Nie udało się pobrać listy wiadomości.' });
    }
  });
  return router;
}
