import fs from 'node:fs';
import path from 'node:path';
import { REACTION_ACTORS } from '../../src/lib/chatReactionKeys.mjs';
const VALID_VOTES = new Set(['up', 'down']);
const keyPattern = /^(?:m_[a-z0-9]{1,16}_[a-z0-9]{1,8}|l_[a-z0-9]{1,16})$/;
export class ChatReactionStore {
  constructor(filePath = 'data/chat-reactions.json') {
    this.filePath = path.resolve(filePath);
    this.data = {};
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [key, votes] of Object.entries(parsed).slice(0, 10000)) {
          if (!keyPattern.test(key) || !votes || typeof votes !== 'object' || Array.isArray(votes)) continue;
          const safe = {};
          for (const actor of REACTION_ACTORS) if (VALID_VOTES.has(votes[actor])) safe[actor] = votes[actor];
          if (Object.keys(safe).length) this.data[key] = safe;
        }
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error; // Do not overwrite an unreadable store.
    }
  }
  list() { return structuredClone(this.data); }
  get(key) { return { ...(this.data[key] || {}) }; }
  clear() {
    const draft = {};
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = this.filePath + '.tmp-' + process.pid;
    try {
      fs.writeFileSync(temporary, JSON.stringify(draft), { mode: 0o600 });
      fs.renameSync(temporary, this.filePath);
      this.data = draft;
    } finally {
      try { fs.unlinkSync(temporary); } catch { /* renamed or not created */ }
    }
    return this.list();
  }
  vote(key, actor, requested) {
    return this.writeVote(key, actor, requested, true);
  }
  // Idempotent setter for queued browser votes; retrying must never undo a vote.
  setVote(key, actor, requested) {
    return this.writeVote(key, actor, requested, false);
  }
  writeVote(key, actor, requested, toggle) {
    if (!keyPattern.test(key) || !REACTION_ACTORS.includes(actor) ||
      (requested !== null && !VALID_VOTES.has(requested))) {
      throw Object.assign(new Error('Nieprawidłowy głos, uczestnik lub identyfikator wiadomości.'), { status: 400 });
    }
    const draft = structuredClone(this.data);
    const votes = { ...(draft[key] || {}) };
    const next = toggle && votes[actor] === requested ? null : requested;
    if (next) votes[actor] = next;
    else delete votes[actor];
    if (Object.keys(votes).length) draft[key] = votes;
    else delete draft[key];
    // Bound growth without deleting active entries silently.
    if (Object.keys(draft).length > 10000) throw Object.assign(new Error('Limit historii ocen został osiągnięty.'), { status: 507 });
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = this.filePath + '.tmp-' + process.pid;
    try {
      fs.writeFileSync(temporary, JSON.stringify(draft), { mode: 0o600 });
      fs.renameSync(temporary, this.filePath);
      this.data = draft;
      return { votes: this.get(key), selection: next };
    } finally {
      try { fs.unlinkSync(temporary); } catch { /* renamed or not created */ }
    }
  }
}
