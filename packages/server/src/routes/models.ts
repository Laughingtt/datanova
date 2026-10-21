import { Hono } from "hono";
import { CUSTOM_MODELS, models, resolveModel, isProviderConfigured } from "../agent/model-provider.js";

const app = new Hono();

const DEFAULT_PROVIDER = process.env.DATANOVA_PROVIDER || "";
const DEFAULT_MODEL = process.env.DATANOVA_MODEL || "";
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || "";

/**
 * pi-ai 1.3's Anthropic provider always calls its catalog base URL
 * (api.anthropic.com) and ignores ANTHROPIC_BASE_URL. When the environment
 * routes Anthropic traffic through a proxy (e.g. a Claude Code DeepSeek
 * proxy), listing `anthropic` would send the proxy token to api.anthropic.com
 * and fail with 403, so hide it in that case.
 */
function isProviderUsable(provider: string): boolean {
  if (provider === "anthropic" && ANTHROPIC_BASE_URL) {
    try {
      return new URL(ANTHROPIC_BASE_URL).hostname === "api.anthropic.com";
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * GET /api/models
 *
 * Returns available LLM providers and models.
 * Only includes providers that have a configured API key in the environment.
 * Built-in pi-ai models are merged with CUSTOM_MODELS (e.g. MiniMax-M3)
 * so users can pick them explicitly from the dropdown.
 */
app.get("/", async (c) => {
  const providers = models.getProviders().map((p) => p.id);
  const requested = c.req.query("provider");

  // --- registered models per provider ---
  const builtIn: Record<string, { id: string; name: string; contextWindow: number }[]> = {};
  for (const provider of providers) {
    builtIn[provider] = models.getModels(provider).map((m) => ({
      id: m.id,
      name: m.name,
      contextWindow: m.contextWindow,
    }));
  }

  // --- custom (OpenAI-compatible) models per provider ---
  const custom: Record<string, { id: string; name: string; contextWindow: number }[]> = {};
  for (const { provider, id, name, contextWindow } of CUSTOM_MODELS) {
    (custom[provider] ??= []).push({ id, name, contextWindow });
  }

  // --- validate that each custom entry actually resolves + has a key ---
  for (const provider of Object.keys(custom)) {
    const configured = isProviderUsable(provider) && await isProviderConfigured(provider);
    if (!configured) {
      // Provider key missing — drop custom entries so the user only sees
      // options that would actually work.
      delete custom[provider];
      continue;
    }
    custom[provider] = custom[provider].filter((m) => {
      try {
        resolveModel(provider, m.id);
        return true;
      } catch {
        return false;
      }
    });
  }

  // --- merge ---
  const configuredProviders: string[] = [];
  for (const provider of providers) {
    if (isProviderUsable(provider) && await isProviderConfigured(provider)) {
      configuredProviders.push(provider);
    }
  }
  const allProviders = new Set<string>([
    ...configuredProviders,
    ...Object.keys(custom),
  ]);

  // The UI auto-selects the first provider/model in this list, so surface the
  // configured default (DATANOVA_PROVIDER / DATANOVA_MODEL) first.
  const orderedProviders = Array.from(allProviders).sort((a, b) => {
    if (a === DEFAULT_PROVIDER) return -1;
    if (b === DEFAULT_PROVIDER) return 1;
    return 0;
  });

  const result = orderedProviders.map((provider) => {
    if (requested && provider !== requested) return null as any;

    const piAiHas = builtIn[provider] !== undefined;
    const piAiKey = configuredProviders.includes(provider);

    const piAiList = piAiHas && piAiKey ? builtIn[provider] : [];
    const customList = custom[provider] ?? [];

    // Deduplicate by id (custom wins over built-in on conflict).
    const seen = new Set<string>();
    const merged = [...piAiList, ...customList].filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    if (provider === DEFAULT_PROVIDER && DEFAULT_MODEL) {
      const index = merged.findIndex((m) => m.id === DEFAULT_MODEL);
      if (index > 0) merged.unshift(...merged.splice(index, 1));
    }

    return {
      provider,
      models: merged,
    };
  }).filter((x) => x !== null && (x as any).models.length > 0);

  return c.json(result);
});

export default app;
