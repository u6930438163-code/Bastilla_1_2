/**
 * Human-readable provider provenance for the existing "Głos AI" feature.
 * A locally generated template must never look like a successful model inference.
 */
const LABELS = Object.freeze({
  openai: 'OpenAI',
  ollama: 'Ollama',
});
const AGENTS = new Set(['Alex', 'Astyria', 'Aurelius', 'si_1']);
export function freeVoiceEngineLabel(value) {
  if (value === 'local_free_voice') return 'lokalny szablon, bez API AI';
  if (value === 'error') return 'model niedostępny';
  if (typeof value !== 'string') return 'źródło niepotwierdzone';
  const at = value.indexOf(':');
  if (at <= 0) return 'źródło niepotwierdzone';
  const provider = value.slice(0, at);
  const model = value.slice(at + 1).trim();
  if (!Object.prototype.hasOwnProperty.call(LABELS, provider)) return 'źródło niepotwierdzone';
  return LABELS[provider] + (model ? ' · ' + model.slice(0, 80) : '');
}
export function summarizeFreeVoiceEngines(data, agents) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(agents)) {
    return '';
  }
  return agents.filter(name => AGENTS.has(name)).map(name => {
    const readable = name === 'si_1' ? 'Aria' : name;
    return readable + ': ' + freeVoiceEngineLabel(data[name]);
  }).join(' | ');
}
