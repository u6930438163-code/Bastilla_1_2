/**
 * Extract a human-chosen recipient from a diagnostic card draft.
 * The draft remains unsent; this helper only selects a chat channel.
 */
const AGENTS = Object.freeze({
  Aria: 'si_1',
  Alex: 'Alex',
  Astyria: 'Astyria',
  Aurelius: 'Aurelius',
});
export function draftAgentTarget(input) {
  if (typeof input !== 'string') return null;
  const match = /^Do agenta (Aria|Alex|Astyria|Aurelius):(?:\s|$)/.exec(input);
  if (!match) return null;
  return Object.prototype.hasOwnProperty.call(AGENTS, match[1]) ? AGENTS[match[1]] : null;
}
