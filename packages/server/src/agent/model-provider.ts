import {
  createProvider,
  envApiKeyAuth,
  type Model,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

/**
 * Shared pi-ai model collection (pi-ai 1.3.x).
 *
 * `builtinModels()` registers every built-in provider factory, so requests
 * resolve auth (ANTHROPIC_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY, …) from
 * the environment automatically — no `getEnvApiKey` plumbing is required.
 */
export const models = builtinModels();

/**
 * Stream function handed to every pi Agent. `Models.streamSimple` satisfies
 * pi-agent-core's `StreamFn` contract and handles provider dispatch + auth.
 */
export const streamFn = models.streamSimple.bind(models);

/**
 * Custom (OpenAI-compatible) models that aren't in pi-ai's built-in registry
 * (or whose built-in provider targets a different endpoint) but should still
 * be selectable in the UI.
 */
export const CUSTOM_MODELS: ReadonlyArray<{ provider: string; id: string; name: string; contextWindow: number }> = [
  { provider: "minimax", id: "MiniMax-M3", name: "MiniMax M3", contextWindow: 1_000_000 },
  { provider: "minimax", id: "MiniMax-Text-01", name: "MiniMax Text-01", contextWindow: 1_000_000 },
  { provider: "minimax-cn", id: "MiniMax-M3", name: "MiniMax M3 (中国版)", contextWindow: 1_000_000 },
  { provider: "minimax-cn", id: "MiniMax-Text-01", name: "MiniMax Text-01 (中国版)", contextWindow: 1_000_000 },
];

/**
 * Build a MiniMax chat model on the OpenAI-compatible endpoint.
 *
 * pi-ai 1.3's built-in `minimax` provider targets the Anthropic-compatible
 * international endpoint (`api.minimax.io/anthropic`), which rejects keys
 * issued for the OpenAI-compatible endpoints used by this deployment. We
 * override the provider below so existing MINIMAX_API_KEY values keep working.
 */
function buildMiniMaxModel(
  provider: "minimax" | "minimax-cn",
  baseUrl: string,
  id: string,
  name: string,
): Model<"openai-completions"> {
  return {
    id,
    name,
    api: "openai-completions",
    provider,
    baseUrl,
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

function registerMiniMaxProviders(): void {
  models.setProvider(createProvider({
    id: "minimax",
    name: "MiniMax",
    baseUrl: "https://api.minimaxi.com/v1",
    auth: { apiKey: envApiKeyAuth("MiniMax API key", ["MINIMAX_API_KEY"]) },
    models: [
      buildMiniMaxModel("minimax", "https://api.minimaxi.com/v1", "MiniMax-M3", "MiniMax M3"),
      buildMiniMaxModel("minimax", "https://api.minimaxi.com/v1", "MiniMax-Text-01", "MiniMax Text-01"),
    ],
    api: openAICompletionsApi(),
  }));

  models.setProvider(createProvider({
    id: "minimax-cn",
    name: "MiniMax (China)",
    baseUrl: "https://api.minimaxi.cn/v1",
    auth: { apiKey: envApiKeyAuth("MiniMax China API key", ["MINIMAX_CN_API_KEY"]) },
    models: [
      buildMiniMaxModel("minimax-cn", "https://api.minimaxi.cn/v1", "MiniMax-M3", "MiniMax M3 (中国版)"),
      buildMiniMaxModel("minimax-cn", "https://api.minimaxi.cn/v1", "MiniMax-Text-01", "MiniMax Text-01 (中国版)"),
    ],
    api: openAICompletionsApi(),
  }));
}

registerMiniMaxProviders();

/**
 * Resolve a Model for a provider/modelId pair from the registered catalog.
 *
 * To support a model that isn't in the catalog yet, register a provider with
 * `createProvider()` on `models` (see registerMiniMaxProviders above).
 */
export function resolveModel(provider: string, modelId: string): Model<any> {
  const model = models.getModel(provider, modelId);
  if (model) return model as Model<any>;

  throw new Error(
    `Unsupported model "${modelId}" for provider "${provider}". ` +
    `Either upgrade @earendil-works/pi-ai, or register a provider in model-provider.ts.`
  );
}

/** True when the provider has complete auth configuration (env key, stored credential, …). */
export async function isProviderConfigured(provider: string): Promise<boolean> {
  try {
    return !!(await models.checkAuth(provider));
  } catch {
    return false;
  }
}
