import { configuredProviders, type LlmChainConfig } from './llmChain.ts';

/** Explicit chat provider selection cannot silently cross API/Ollama boundary. */
export type ChatProviderMode = 'api' | 'ollama';

export function selectChatProviderConfig(
  config: LlmChainConfig,
  mode?: ChatProviderMode,
): LlmChainConfig {
  const available = configuredProviders(config);
  const providers = mode === 'api'
    ? available.filter(provider => provider === 'openai')
    : mode === 'ollama'
      ? available.filter(provider => provider === 'ollama')
      : available;
  return { ...config, providers };
}
