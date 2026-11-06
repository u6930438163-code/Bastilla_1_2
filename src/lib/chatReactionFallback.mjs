/** Pending operator selections allow the original chat to work in AI Studio Preview
 * when the server API is temporarily absent. Never manufacture votes for agents. */
const KEY = /^(?:m_[a-z0-9]{1,16}_[a-z0-9]{1,8}|l_[a-z0-9]{1,16})$/;
const VALID = new Set(['up', 'down', null]);

export function loadPendingReactionVotes(storage, storageKey) {
  try {
    const parsed = JSON.parse(storage?.getItem(storageKey) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result = {};
    for (const [key, vote] of Object.entries(parsed).slice(0, 10000)) {
      if (KEY.test(key) && VALID.has(vote)) result[key] = vote;
    }
    return result;
  } catch {
    return {};
  }
}

export function mergePendingReactionVotes(remote = {}, pending = {}) {
  const merged = { ...remote };
  for (const [key, vote] of Object.entries(pending)) {
    if (!KEY.test(key) || !VALID.has(vote)) continue;
    const votes = { ...(merged[key] || {}) };
    if (vote === null) delete votes.Operator;
    else votes.Operator = vote;
    merged[key] = votes;
  }
  return merged;
}

export function nextOperatorReaction(current, selected) {
  return current === selected ? null : selected;
}
