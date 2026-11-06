/**
 * Stable message keys shared between browser and server.
 * Keys are content-addressed, with an occurrence suffix to distinguish repeats.
 * Use normalized chat_history on both ends.
 */
export const REACTION_ACTORS = Object.freeze(['Operator', 'Aria', 'Alex', 'Astyria', 'Aurelius']);
export function canonicalReactionActor(agent) {
  if (agent === 'si_1' || agent === 'Aria') return 'Aria';
  if (agent === 'Mateusz Mitek' || agent === 'Operator') return 'Operator';
  return REACTION_ACTORS.includes(agent) ? agent : String(agent || '').slice(0, 80);
}
function fnv64(source) {
  let hash = 0xcbf29ce484222325n;
  for (const point of source) {
    hash ^= BigInt(point.codePointAt(0));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(36);
}
export function chatReactionKeys(history) {
  if (!Array.isArray(history)) return [];
  const seen = new Map();
  return history.map(record => {
    const actor = canonicalReactionActor(record?.agent);
    const content = typeof record?.tekst === 'string' ? record.tekst : '';
    const base = 'm_' + fnv64(actor + '\0' + content);
    const occurrence = seen.get(base) || 0;
    seen.set(base, occurrence + 1);
    return base + '_' + occurrence.toString(36);
  });
}

/** Reaction identity for a real live-chat event, stable across refresh and channels. */
export function liveReactionKey(event) {
  const id = event && typeof event.id === 'string' ? event.id : '';
  // Real worker/user event IDs are UUIDs. Never accept an untrusted, arbitrary key.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return '';
  return 'l_' + fnv64(id.toLowerCase());
}
