import { Hono } from "hono";
import { getProviders, getModels, getEnvApiKey } from "@earendil-works/pi-ai";
import { CUSTOM_MODELS, resolveModel } from "../agent/model-provider.js";

const app = new Hono();

/**
 * GET /api/models
 *
 * Returns available LLM providers and models.
 * Only includes providers that have a configured API key in the environment.
 * Built-in pi-ai models are merged with CUSTOM_MODELS (e.g. MiniMax-M3)
 * so users can pick them explicitly from the dropdown.
 */
app.get("/", (c) => {
  const providers = getProviders();
  const requested = c.req.query("provider");

  // --- built-in models per provider ---
  const builtIn: Record<string, { id: string; name: string; contextWindow: number }[]> = {};
  for (const provider of providers) {
    builtIn[provider] = getModels(provider).map((m) => ({
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
    const key = getEnvApiKey(provider as any);
    if (!key) {
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
  const allProviders = new Set<string>([
    ...providers.filter((p) => !!getEnvApiKey(p)),
    ...Object.keys(custom),
  ]);

  const result = Array.from(allProviders).map((provider) => {
    // Filter pi-ai's getProviders() to those still required (some keys
    // may have been missing for the provider itself but present for a
    // custom entry — handled above already).
    if (requested && provider !== requested) return null as any;

    const piAiHas = builtIn[provider] !== undefined;
    const piAiKey = piAiHas ? !!getEnvApiKey(provider as any) : false;

    const piAiList = piAiHas && piAiKey ? builtIn[provider] : [];
    const customList = custom[provider] ?? [];

    // Deduplicate by id (custom wins over built-in on conflict).
    const seen = new Set<string>();
    const merged = [...piAiList, ...customList].filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    return {
      provider,
      models: merged,
    };
  }).filter((x) => x !== null && (x as any).models.length > 0);

  return c.json(result);
});

export default app;
