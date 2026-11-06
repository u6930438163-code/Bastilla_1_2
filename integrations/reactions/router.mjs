import { Router } from 'express';
import { chatReactionKeys, canonicalReactionActor, liveReactionKey } from '../../src/lib/chatReactionKeys.mjs';

export function createChatReactionsRouter({ store, getHistory, getLiveHistory = () => [], sameOrigin, requireWorker, notify }) {
  if (!store || typeof getHistory !== 'function' || typeof sameOrigin !== 'function' ||
      typeof requireWorker !== 'function' || typeof notify !== 'function') {
    throw new Error('Reactions need a persistent store, history verification and actor authentication.');
  }
  const router = Router();
  const messages = async () => {
    const [history, liveHistory] = await Promise.all([getHistory(), getLiveHistory()]);
    const list = Array.isArray(history) ? history : [];
    const live = Array.isArray(liveHistory) ? liveHistory.filter(item => item?.type === 'message') : [];
    return { history: list, keys: chatReactionKeys(list), live, liveKeys: live.map(liveReactionKey) };
  };
  const respondVote = async (req, res, actor) => {
    const key = req.body?.messageKey;
    const vote = req.body?.vote;
    if (typeof key !== 'string' || (vote !== 'up' && vote !== 'down' && vote !== null)) {
      return res.status(400).json({ error: 'Podaj messageKey oraz vote: up, down lub null.' });
    }
    try {
      const { keys, liveKeys } = await messages();
      if (!keys.includes(key) && !liveKeys.includes(key)) return res.status(404).json({ error: 'Wiadomość nie istnieje w aktualnej historii czatu.' });
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
      const { history, keys, live, liveKeys } = await messages();
      const offset = Math.max(0, history.length - 60);
      const liveOffset = Math.max(0, live.length - 60);
      const kernelItems = history.slice(offset).map((item, index) => ({
        messageKey: keys[index + offset],
        author: canonicalReactionActor(item.agent),
        preview: String(item.tekst || '').slice(0, 200),
        votes: store.get(keys[index + offset]),
        kind: 'kernel',
      }));
      const workerItems = live.slice(liveOffset).map((item, index) => ({
        messageKey: liveKeys[index + liveOffset],
        author: canonicalReactionActor(item.sender === 'user' ? 'Operator' : item.sender),
        preview: String(item.text || '').slice(0, 200),
        votes: store.get(liveKeys[index + liveOffset]),
        kind: 'live',
      }));
      return res.json({ messages: [...kernelItems, ...workerItems].filter(item => item.messageKey) });
    } catch (error) {
      return res.status(503).json({ error: error?.message || 'Nie udało się pobrać listy wiadomości.' });
    }
  });
  return router;
}
