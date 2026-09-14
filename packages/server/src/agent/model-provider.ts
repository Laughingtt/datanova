import { getModel, type Model } from "@earendil-works/pi-ai";

/**
 * Custom (OpenAI-compatible) models that aren't in pi-ai's built-in registry
 * but should be selectable in the UI. Each entry pairs a provider with the
 * list of model ids that resolveModel() can construct for it.
 *
 * Listed alongside pi-ai's built-ins by /api/models so users can pick them
 * explicitly. The actual API key is still resolved by getEnvApiKey(provider).
 */
export const CUSTOM_MODELS: ReadonlyArray<{ provider: string; id: string; name: string; contextWindow: number }> = [
  // MiniMax M-series — OpenAI-compatible, https://api.minimaxi.com/v1
  { provider: "minimax", id: "MiniMax-M3",     name: "MiniMax M3",         contextWindow: 1_000_000 },
  { provider: "minimax", id: "MiniMax-Text-01", name: "MiniMax Text-01",    contextWindow: 1_000_000 },
  // MiniMax M-series — China endpoint, https://api.minimaxi.cn/v1
  { provider: "minimax-cn", id: "MiniMax-M3",     name: "MiniMax M3 (中国版)",   contextWindow: 1_000_000 },
  { provider: "minimax-cn", id: "MiniMax-Text-01", name: "MiniMax Text-01 (中国版)", contextWindow: 1_000_000 },
];

/**
 * Resolve a Model for a given provider/modelId pair.
 *
 * Two strategies, applied in order:
 *
 * 1. Try the pi-ai built-in model registry (covers Anthropic, OpenAI, Gemini,
 *    DeepSeek, Moonshot, ZAI, MiniMax-M2.7, etc.). This works for any provider
 *    whose ENV-key + base URL is hardcoded in pi-ai.
 *
 * 2. Construct a custom OpenAI-compatible Model on the fly. Used for models
 *    that aren't yet in pi-ai's generated MODELS table (e.g. newer MiniMax
 *    checkpoints such as MiniMax-M3) but speak the standard OpenAI chat-
 *    completions protocol on a custom base URL.
 *
 * API keys are resolved separately by `getEnvApiKey(model.provider)` in each
 * harness's `getApiKeyAndHeaders` callback. pi-ai already maps provider →
 * env var name (see env-api-keys.js); the provider strings used here must
 * match what pi-ai expects.
 */
export function resolveModel(provider: string, modelId: string): Model<any> {
  // Strategy 1 — built-in registry
  try {
    const known = getModel(provider as any, modelId as any);
    if (known) return known as Model<any>;
  } catch {
    // Unknown combination — fall through to custom construction.
  }

  // Strategy 2 — custom OpenAI-compatible construction
  const custom = buildCustomModel(provider, modelId);
  if (custom) return custom;

  throw new Error(
    `Unsupported model "${modelId}" for provider "${provider}". ` +
    `Either upgrade @earendil-works/pi-ai, or add a builder in model-provider.ts.`
  );
}

/**
 * Custom-model factories keyed by provider. Add new providers here when a
 * vendor publishes a new model that's OpenAI-compatible on a custom base URL.
 */
function buildCustomModel(provider: string, modelId: string): Model<any> | null {
  // ---- MiniMax (MiniMax AI, https://api.minimaxi.com/v1) ----
  // Compatible with OpenAI /v1/chat/completions. Supports streaming + thinking
  // (model emits inline <think>...</think> markers in its content, so we
  // configure pi-ai to extract them as proper thinking blocks).
  if (provider === "minimax" || provider === "MiniMax") {
    return {
      id: modelId,
      name: `MiniMax ${modelId.replace(/^MiniMax-/i, "")}`,
      api: "openai-completions",
      provider: "minimax",
      baseUrl: "https://api.minimaxi.com/v1",
      reasoning: true,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 1_000_000,
      maxTokens: 8192,
      compat: {
        // MiniMax returns token usage even when streaming.
        supportsUsageInStreaming: true,
        // MiniMax streams thinking inline (<think>...</think>) rather than as
        // separate reasoning_content blocks, so pi-ai needs to parse it.
        requiresThinkingAsText: true,
        // MiniMax uses the legacy OpenAI `max_tokens` field, not `max_completion_tokens`.
        maxTokensField: "max_tokens",
        // MiniMax expects the OpenAI `tool` role in tool results (default).
        requiresToolResultName: true,
      },
    };
  }

  // ---- MiniMax 中国大陆版 (https://api.minimaxi.cn/v1) ----
  if (provider === "minimax-cn") {
    return {
      ...buildCustomModel("minimax", modelId)!,
      provider: "minimax-cn",
      baseUrl: "https://api.minimaxi.cn/v1",
    };
  }

  return null;
}
